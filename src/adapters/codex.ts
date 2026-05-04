import { globSync } from "glob";
import { basename, dirname } from "node:path";
import { CODEX_SESSIONS_DIR } from "../shared/config.js";
import type {
  LogAdapter, AdapterState, ParsedSession, TokenRecord,
} from "../shared/types.js";

interface CodexTokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

interface CodexEntry {
  timestamp?: string;
  type?: string;
  payload?: {
    id?: string;
    cwd?: string;
    type?: string;
    model?: string;
    info?: {
      total_token_usage?: CodexTokenUsage;
      last_token_usage?: CodexTokenUsage;
    };
  };
}

export class CodexAdapter implements LogAdapter {
  readonly provider = "codex";
  readonly readMode = "incremental" as const;

  findSessionFiles(): string[] {
    return globSync(`${CODEX_SESSIONS_DIR}/**/*.jsonl`);
  }

  extractSessionId(filePath: string): string {
    return basename(filePath, ".jsonl");
  }

  parseContent(
    text: string,
    _filePath: string,
    sessionId: string,
    existingIds: Set<string>,
    resumeState: AdapterState | null,
  ): ParsedSession {
    const lines = text.split("\n").filter(l => l.trim());

    let projectPath = "unknown";
    let currentModel = (resumeState?.current_model as string) ?? "unknown";
    let prevTotalInput = (resumeState?.prev_total_input as number) ?? 0;
    let prevTotalOutput = (resumeState?.prev_total_output as number) ?? 0;

    const records: TokenRecord[] = [];

    for (const line of lines) {
      let entry: CodexEntry;
      try { entry = JSON.parse(line); } catch { continue; }

      if (entry.type === "session_meta" && entry.payload) {
        if (entry.payload.cwd) projectPath = entry.payload.cwd;
        continue;
      }

      if (entry.type === "turn_context" && entry.payload?.model) {
        currentModel = entry.payload.model;
        continue;
      }

      if (entry.type !== "event_msg") continue;
      if (entry.payload?.type !== "token_count") continue;

      const info = entry.payload.info;
      if (!info) continue;

      const total = info.total_token_usage;
      const last = info.last_token_usage;
      if (!total || !last) continue;

      const totalIn = total.input_tokens ?? 0;
      const totalOut = total.output_tokens ?? 0;

      if (totalIn === prevTotalInput && totalOut === prevTotalOutput) continue;

      const lastIn = last.input_tokens ?? 0;
      const lastOut = last.output_tokens ?? 0;
      if (lastIn === 0 && lastOut === 0) continue;

      const msgId = `codex:${sessionId}:${totalIn}:${totalOut}`;
      prevTotalInput = totalIn;
      prevTotalOutput = totalOut;

      if (existingIds.has(msgId)) continue;

      records.push({
        session_id: sessionId,
        project_path: projectPath,
        provider: this.provider,
        message_id: msgId,
        timestamp: entry.timestamp ?? new Date().toISOString(),
        model: currentModel,
        input_tokens: lastIn,
        output_tokens: lastOut,
        cache_read_tokens: last.cached_input_tokens ?? 0,
        cache_create_tokens: 0,
        reasoning_tokens: last.reasoning_output_tokens ?? 0,
        task_name: null,
        trigger_type: "none",
        request_id: null,
        git_branch: null,
        raw_source: null,
      });
    }

    return {
      records,
      state: {
        current_model: currentModel,
        prev_total_input: prevTotalInput,
        prev_total_output: prevTotalOutput,
      },
    };
  }
}
