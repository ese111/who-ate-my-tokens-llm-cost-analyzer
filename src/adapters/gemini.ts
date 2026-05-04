import { globSync } from "glob";
import { basename, dirname } from "node:path";
import { GEMINI_TMP_DIR } from "../shared/config.js";
import type {
  LogAdapter, AdapterState, ParsedSession, TokenRecord,
} from "../shared/types.js";

interface GeminiTokens {
  input?: number;
  output?: number;
  cached?: number;
  thoughts?: number;
  tool?: number;
  total?: number;
}

interface GeminiMessage {
  id?: string;
  timestamp?: string;
  type?: string;
  tokens?: GeminiTokens;
  model?: string;
}

interface GeminiSession {
  sessionId?: string;
  projectHash?: string;
  messages?: GeminiMessage[];
}

export class GeminiAdapter implements LogAdapter {
  readonly provider = "gemini";
  readonly readMode = "full" as const;

  findSessionFiles(): string[] {
    return globSync(`${GEMINI_TMP_DIR}/*/chats/session-*.json`);
  }

  extractSessionId(filePath: string): string {
    return basename(filePath, ".json");
  }

  parseContent(
    text: string,
    filePath: string,
    _sessionId: string,
    existingIds: Set<string>,
    _resumeState: AdapterState | null,
  ): ParsedSession {
    let session: GeminiSession;
    try { session = JSON.parse(text); } catch { return { records: [], state: {} }; }

    const sessionId = session.sessionId ?? this.extractSessionId(filePath);
    const projectPath = this.extractProjectPath(filePath);
    const messages = session.messages ?? [];
    const records: TokenRecord[] = [];

    for (const msg of messages) {
      if (msg.type !== "gemini") continue;
      if (!msg.tokens || !msg.id) continue;

      const msgId = `gemini:${msg.id}`;
      if (existingIds.has(msgId)) continue;

      const t = msg.tokens;
      records.push({
        session_id: sessionId,
        project_path: projectPath,
        provider: this.provider,
        message_id: msgId,
        timestamp: msg.timestamp ?? new Date().toISOString(),
        model: msg.model ?? "unknown",
        input_tokens: t.input ?? 0,
        output_tokens: t.output ?? 0,
        cache_read_tokens: t.cached ?? 0,
        cache_create_tokens: 0,
        reasoning_tokens: t.thoughts ?? 0,
        task_name: null,
        trigger_type: "none",
        request_id: null,
        git_branch: null,
        raw_source: null,
      });
    }

    return { records, state: {} };
  }

  private extractProjectPath(filePath: string): string {
    const chatsDir = dirname(filePath);
    const projectDir = dirname(chatsDir);
    return basename(projectDir);
  }
}
