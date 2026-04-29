import type { RawJsonlEntry, SkillDetection, ContentBlock } from "../shared/types.js";
import { BUILTIN_COMMANDS } from "../shared/config.js";

const COMMAND_NAME_RE = /<command-name>\/([^<]+)<\/command-name>/;

export function detectSkillFromUser(entry: RawJsonlEntry): SkillDetection | null {
  if (entry.type !== "user") return null;

  const content = extractTextContent(entry);
  if (!content) return null;

  const match = content.match(COMMAND_NAME_RE);
  if (!match) return null;

  const rawName = "/" + match[1].trim();
  if (BUILTIN_COMMANDS.has(rawName)) return null;

  return { name: match[1].trim(), trigger_type: "user_slash" };
}

export function detectSkillFromAssistant(entry: RawJsonlEntry): SkillDetection | null {
  if (entry.type !== "assistant") return null;

  const content = entry.message?.content;
  if (!Array.isArray(content)) return null;

  for (const block of content as ContentBlock[]) {
    if (block.type === "tool_use" && block.name === "Skill" && block.input) {
      const skillName = block.input.skill as string | undefined;
      if (skillName) {
        return { name: skillName, trigger_type: "model_tool_call" };
      }
    }
  }

  return null;
}

function extractTextContent(entry: RawJsonlEntry): string | null {
  const content = entry.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const block of content as ContentBlock[]) {
    if (block.type === "text" && block.text) {
      parts.push(block.text);
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}
