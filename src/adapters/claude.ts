import { globSync } from "glob";
import { join, basename } from "node:path";
import { CLAUDE_PROJECTS_DIR, BUILTIN_COMMANDS } from "../shared/config.js";
import type {
  LogAdapter, AdapterState, ParsedSession,
  TokenRecord, RawJsonlEntry, ContentBlock,
} from "../shared/types.js";

const COMMAND_NAME_RE = /<command-name>\/([^<]+)<\/command-name>/;

export class ClaudeAdapter implements LogAdapter {
  readonly provider = "claude";
  readonly readMode = "incremental" as const;

  findSessionFiles(): string[] {
    return globSync(join(CLAUDE_PROJECTS_DIR, "*", "*.jsonl"));
  }

  extractSessionId(filePath: string): string {
    return basename(filePath, ".jsonl");
  }

  parseContent(
    text: string,
    filePath: string,
    sessionId: string,
    existingIds: Set<string>,
    resumeState: AdapterState | null,
  ): ParsedSession {
    const lines = text.split("\n").filter(l => l.trim());

    let activeSkill = (resumeState?.active_skill as string | null) ?? null;
    let activeTrigger: TokenRecord["trigger_type"] = (resumeState?.active_trigger as TokenRecord["trigger_type"]) ?? "none";
    let activePromptId = (resumeState?.active_prompt_id as string | null) ?? null;

    let projectPath = this.extractProjectPath(filePath);
    for (const line of lines) {
      try {
        const entry: RawJsonlEntry = JSON.parse(line);
        if (entry.cwd) { projectPath = entry.cwd; break; }
      } catch { continue; }
    }

    const latestByMsgId = new Map<string, TokenRecord>();

    for (const line of lines) {
      let entry: RawJsonlEntry;
      try { entry = JSON.parse(line); } catch { continue; }

      const userSkill = this.detectSkillFromUser(entry);
      if (userSkill) {
        activeSkill = userSkill.name;
        activeTrigger = userSkill.trigger;
        activePromptId = entry.promptId ?? null;
        continue;
      }

      if (entry.type === "user" && entry.promptId && entry.promptId !== activePromptId) {
        activeSkill = null;
        activeTrigger = "none";
        activePromptId = entry.promptId;
      }

      const modelSkill = this.detectSkillFromAssistant(entry);
      if (modelSkill) {
        activeSkill = modelSkill.name;
        activeTrigger = modelSkill.trigger;
      }

      if (entry.type === "assistant" && entry.message?.id && entry.message?.usage) {
        latestByMsgId.set(entry.message.id, this.buildRecord(
          entry, entry.message.id, sessionId, projectPath, activeSkill, activeTrigger,
        ));
      }
    }

    const records: TokenRecord[] = [];
    for (const [msgId, record] of latestByMsgId) {
      if (!existingIds.has(msgId)) records.push(record);
    }

    return {
      records,
      state: { active_skill: activeSkill, active_prompt_id: activePromptId, active_trigger: activeTrigger },
    };
  }

  private extractProjectPath(filePath: string): string {
    const parts = filePath.split("/");
    const projectsIdx = parts.indexOf("projects");
    if (projectsIdx >= 0 && projectsIdx + 1 < parts.length) {
      return parts[projectsIdx + 1].replace(/-/g, "/").replace(/^\//, "");
    }
    return "unknown";
  }

  private detectSkillFromUser(entry: RawJsonlEntry): { name: string; trigger: TokenRecord["trigger_type"] } | null {
    if (entry.type !== "user") return null;
    const content = this.extractTextContent(entry);
    if (!content) return null;
    const match = content.match(COMMAND_NAME_RE);
    if (!match) return null;
    const rawName = "/" + match[1].trim();
    if (BUILTIN_COMMANDS.has(rawName)) return null;
    return { name: match[1].trim(), trigger: "user_slash" };
  }

  private detectSkillFromAssistant(entry: RawJsonlEntry): { name: string; trigger: TokenRecord["trigger_type"] } | null {
    if (entry.type !== "assistant") return null;
    const content = entry.message?.content;
    if (!Array.isArray(content)) return null;
    for (const block of content as ContentBlock[]) {
      if (block.type === "tool_use" && block.name === "Skill" && block.input) {
        const skillName = block.input.skill as string | undefined;
        if (skillName) return { name: skillName, trigger: "model_tool_call" };
      }
    }
    return null;
  }

  private extractTextContent(entry: RawJsonlEntry): string | null {
    const content = entry.message?.content;
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return null;
    const parts: string[] = [];
    for (const block of content as ContentBlock[]) {
      if (block.type === "text" && block.text) parts.push(block.text);
    }
    return parts.length > 0 ? parts.join("\n") : null;
  }

  private buildRecord(
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
      provider: this.provider,
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
}
