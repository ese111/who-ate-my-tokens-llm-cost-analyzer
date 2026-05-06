#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { runSync } from "./commands/sync.js";
import { runReport } from "./commands/report.js";
import { runVerify } from "./commands/verify.js";
import { runUpdate } from "./commands/update.js";

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
  .option("-q, --quiet", "Only show final result")
  .option("-v, --verbose", "Show detailed progress")
  .addHelpText("after", `
Examples:
  $ who-ate-my-tokens sync
  $ who-ate-my-tokens sync --reset
  $ who-ate-my-tokens sync --reset -y`)
  .action(runSync);

program
  .command("report")
  .description("Show token usage report")
  .option("-s, --since <period>", "Time period (e.g. 7d, 30d, 1w, 3m)", "30d")
  .option("-b, --by <grouping>", "Group by: task, model, provider", "task")
  .option("-p, --provider <name>", "Filter by provider (claude, codex, gemini)")
  .option("--json", "Output as JSON")
  .addHelpText("after", `
Examples:
  $ who-ate-my-tokens report
  $ who-ate-my-tokens report --since 7d --by model
  $ who-ate-my-tokens report --by provider
  $ who-ate-my-tokens report -p claude --json`)
  .action(runReport);

program
  .command("verify")
  .description("Verify DB records against raw JSONL (coverage, token, attribution error rates)")
  .option("-d, --detail", "Show per-session mismatch details")
  .option("-s, --session <id>", "Verify a specific session (prefix match)")
  .addHelpText("after", `
Examples:
  $ who-ate-my-tokens verify
  $ who-ate-my-tokens verify --detail
  $ who-ate-my-tokens verify --session abc123`)
  .action(runVerify);

program
  .command("update")
  .description("Update to the latest version")
  .option("-c, --check", "Only check for updates, don't install")
  .addHelpText("after", `
Examples:
  $ who-ate-my-tokens update
  $ who-ate-my-tokens update --check`)
  .action(runUpdate);

program.parse();
