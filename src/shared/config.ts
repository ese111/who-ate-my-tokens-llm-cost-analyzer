import { homedir } from "node:os";
import { join } from "node:path";

export const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
export const CLAUDE_PROJECTS_DIR = join(CLAUDE_HOME, "projects");
export const DB_PATH = join(CLAUDE_HOME, "skillsToken", "data.sqlite");

export const BUILTIN_COMMANDS = new Set([
  "/clear", "/exit", "/model", "/usage", "/mcp", "/config",
  "/help", "/doctor", "/bug", "/context", "/login", "/cost",
  "/status", "/skills", "/agents", "/plugin", "/fast",
  "/compact", "/memory", "/terminal", "/vim", "/review",
  "/ultrareview", "/init", "/add-dir", "/release-notes",
  "/listen", "/permissions",
]);
