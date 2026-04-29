import { readFileSync, statSync } from "node:fs";
import type { LogAdapter, AdapterState } from "../shared/types.js";
import type { Database } from "../db/schema.js";

export function syncAdapter(adapter: LogAdapter, db: Database): { newRecords: number; parsedFiles: number } {
  const files = adapter.findSessionFiles();
  let newRecords = 0;
  let parsedFiles = 0;

  for (const file of files) {
    const count = syncFile(adapter, file, db);
    if (count > 0) {
      newRecords += count;
      parsedFiles++;
    }
  }

  return { newRecords, parsedFiles };
}

function syncFile(adapter: LogAdapter, filePath: string, db: Database): number {
  const stat = statSync(filePath);
  const sourceKey = filePath;
  const parseState = db.getParseState(sourceKey);

  if (parseState &&
      parseState.last_file_size === stat.size &&
      parseState.last_mtime_ms === Math.floor(stat.mtimeMs)) {
    return 0;
  }

  const startOffset = parseState?.last_byte_offset ?? 0;
  const buf = readFileSync(filePath);

  if (startOffset >= buf.length) {
    db.updateParseState({
      source_key: sourceKey,
      last_byte_offset: buf.length,
      last_file_size: stat.size,
      last_mtime_ms: Math.floor(stat.mtimeMs),
    });
    return 0;
  }

  const text = startOffset > 0
    ? buf.subarray(startOffset).toString("utf-8")
    : buf.toString("utf-8");

  const sessionId = adapter.extractSessionId(filePath);
  const existingIds = db.getExistingMessageIds(sessionId);

  const resumeState: AdapterState | null = parseState
    ? { active_skill: db.getActiveSkill(sourceKey), active_prompt_id: db.getActivePromptId(sourceKey), active_trigger: db.getActiveTrigger(sourceKey) }
    : null;

  const result = adapter.parseContent(text, filePath, sessionId, existingIds, resumeState);

  if (result.records.length > 0) {
    db.insertTokenRecords(result.records);
  }

  db.updateParseState({
    source_key: sourceKey,
    last_byte_offset: buf.length,
    last_file_size: stat.size,
    last_mtime_ms: Math.floor(stat.mtimeMs),
    active_skill: result.state.active_skill,
    active_prompt_id: result.state.active_prompt_id,
    active_trigger: result.state.active_trigger,
  });

  return result.records.length;
}
