#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { runSync } from "./commands/sync.js";
import { runReport } from "./commands/report.js";
import { runVerify } from "./commands/verify.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json");

const program = new Command();

program
  .name("who-ate-my-tokens")
  .description("Track AI tool token usage (Claude Code, Codex, Gemini)")
  .version(version);

program
  .command("sync")
  .description("Parse AI tool logs (Claude, Codex, Gemini) and sync to local DB")
  .option("--reset", "Reset DB before syncing")
  .option("-y, --yes", "Skip confirmation prompt for --reset")
  .action(runSync);

program
  .command("report")
  .description("Show token usage report")
  .option("-s, --since <period>", "Time period (e.g. 7d, 30d, 1w, 3m)", "30d")
  .option("-b, --by <grouping>", "Group by: task, model, provider", "task")
  .option("-p, --provider <name>", "Filter by provider (claude, codex, gemini)")
  .option("--json", "Output as JSON")
  .action(runReport);

program
  .command("verify")
  .description("Verify DB records against raw JSONL (coverage, token, attribution error rates)")
  .option("-d, --detail", "Show per-session mismatch details")
  .option("-s, --session <id>", "Verify a specific session (prefix match)")
  .action(runVerify);

program.parse();
