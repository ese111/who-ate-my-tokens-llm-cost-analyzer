import { readFileSync, statSync, openSync, readSync, closeSync } from "node:fs";
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

  const useIncremental = adapter.readMode === "incremental";
  const startOffset = useIncremental ? (parseState?.last_byte_offset ?? 0) : 0;

  let buf: Buffer;
  let fileSize: number;

  if (useIncremental && startOffset > 0) {
    const fd = openSync(filePath, "r");
    try {
      fileSize = stat.size;
      if (startOffset >= fileSize) {
        db.updateParseState({
          source_key: sourceKey,
          last_byte_offset: fileSize,
          last_file_size: fileSize,
          last_mtime_ms: Math.floor(stat.mtimeMs),
        });
        return 0;
      }
      const bytesToRead = fileSize - startOffset;
      buf = Buffer.alloc(bytesToRead);
      readSync(fd, buf, 0, bytesToRead, startOffset);
    } finally {
      closeSync(fd);
    }
  } else {
    buf = readFileSync(filePath);
    fileSize = buf.length;
  }

  const text = buf.toString("utf-8");

  const sessionId = adapter.extractSessionId(filePath);
  const existingIds = db.getExistingMessageIds(sessionId);

  const resumeState: AdapterState | null = parseState
    ? db.getAdapterState(sourceKey)
    : null;

  const result = adapter.parseContent(text, filePath, sessionId, existingIds, resumeState);

  if (result.records.length > 0) {
    db.insertTokenRecords(result.records);
  }

  db.updateParseState({
    source_key: sourceKey,
    last_byte_offset: fileSize,
    last_file_size: stat.size,
    last_mtime_ms: Math.floor(stat.mtimeMs),
    adapter_state: result.state,
  });

  return result.records.length;
}
