import { readFileSync, statSync } from "node:fs";
import { globSync } from "glob";
import { join, basename } from "node:path";
import type { RawJsonlEntry, TokenRecord } from "../shared/types.js";
import type { Database } from "../db/schema.js";
import { CLAUDE_PROJECTS_DIR } from "../shared/config.js";
import { detectSkillFromUser, detectSkillFromAssistant } from "./skill-detector.js";

export function findAllSessionFiles(): string[] {
  return globSync(join(CLAUDE_PROJECTS_DIR, "*", "*.jsonl"));
}

export function extractProjectPath(filePath: string): string {
  const parts = filePath.split("/");
  const projectsIdx = parts.indexOf("projects");
  if (projectsIdx >= 0 && projectsIdx + 1 < parts.length) {
    return parts[projectsIdx + 1].replace(/-/g, "/").replace(/^\//, "");
  }
  return "unknown";
}

export function extractSessionId(filePath: string): string {
  return basename(filePath, ".jsonl");
}

export function parseSessionFile(filePath: string, db: Database): number {
  const stat = statSync(filePath);
  const sourceKey = filePath;
  const parseState = db.getParseState(sourceKey);

  // Skip if file hasn't changed
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

  // For incremental parse, read only new bytes
  const isIncremental = startOffset > 0;
  const text = isIncremental
    ? buf.subarray(startOffset).toString("utf-8")
    : buf.toString("utf-8");

  const lines = text.split("\n").filter(l => l.trim());

  const sessionId = extractSessionId(filePath);
  let projectPath = extractProjectPath(filePath);

  // Try to extract project path from the first entry's cwd field
  for (const line of lines) {
    try {
      const entry: RawJsonlEntry = JSON.parse(line);
      if (entry.cwd) {
        projectPath = entry.cwd;
        break;
      }
    } catch {
      continue;
    }
  }

  // Load attribution state from previous parse
  let activeSkill = db.getActiveSkill(sourceKey);
  let activeTrigger: TokenRecord["trigger_type"] = db.getActiveTrigger(sourceKey);
  let activePromptId = db.getActivePromptId(sourceKey);

  const seenMessageIds = db.getExistingMessageIds(sessionId);
  const records: TokenRecord[] = [];
  // Track last usage per message_id (streaming can produce multiple entries)
  const latestByMsgId = new Map<string, TokenRecord>();

  for (const line of lines) {
    let entry: RawJsonlEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    // 1. Detect skill start from user slash command
    const userSkill = detectSkillFromUser(entry);
    if (userSkill) {
      activeSkill = userSkill.name;
      activeTrigger = userSkill.trigger_type;
      activePromptId = entry.promptId ?? null;
      continue;
    }

    // 2. New user message with different promptId = skill boundary
    if (entry.type === "user" && entry.promptId && entry.promptId !== activePromptId) {
      activeSkill = null;
      activeTrigger = "none";
      activePromptId = entry.promptId;
    }

    // 3. Model auto-invokes Skill tool
    const modelSkill = detectSkillFromAssistant(entry);
    if (modelSkill) {
      activeSkill = modelSkill.name;
      activeTrigger = modelSkill.trigger_type;
    }

    // 4. Extract usage from assistant messages
    if (entry.type === "assistant" && entry.message?.id && entry.message?.usage) {
      const msgId = entry.message.id;
      const record = buildRecord(entry, msgId, sessionId, projectPath, activeSkill, activeTrigger);

      // Always keep the latest entry for each message_id
      latestByMsgId.set(msgId, record);
    }
  }

  // Deduplicate: only insert records with message_ids we haven't seen before
  for (const [msgId, record] of latestByMsgId) {
    if (!seenMessageIds.has(msgId)) {
      records.push(record);
    }
  }

  if (records.length > 0) {
    db.insertTokenRecords(records);
  }

  db.updateParseState({
    source_key: sourceKey,
    last_byte_offset: buf.length,
    last_file_size: stat.size,
    last_mtime_ms: Math.floor(stat.mtimeMs),
    active_skill: activeSkill,
    active_prompt_id: activePromptId,
    active_trigger: activeTrigger,
  });

  return records.length;
}

function buildRecord(
  entry: RawJsonlEntry,
  msgId: string,
  sessionId: string,
  projectPath: string,
  taskName: string | null,
  triggerType: TokenRecord["trigger_type"],
): TokenRecord {
  const usage = entry.message!.usage!;
  return {
    session_id: sessionId,
    project_path: projectPath,
    provider: "claude",
    message_id: msgId,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    model: entry.message!.model ?? "unknown",
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_create_tokens: usage.cache_creation_input_tokens ?? 0,
    reasoning_tokens: 0,
    task_name: taskName,
    trigger_type: triggerType,
    request_id: entry.requestId ?? null,
    git_branch: entry.gitBranch ?? null,
    raw_source: null,
  };
}
