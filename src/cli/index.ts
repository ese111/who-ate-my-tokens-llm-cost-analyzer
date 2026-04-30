#!/usr/bin/env node

import { Command } from "commander";
import { runSync } from "./commands/sync.js";
import { runReport } from "./commands/report.js";
import { runVerify } from "./commands/verify.js";

const program = new Command();

program
  .name("skills-token")
  .description("Track Claude Code skill/task token usage")
  .version("0.1.0");

program
  .command("sync")
  .description("Parse Claude Code JSONL logs and sync to local DB")
  .option("--reset", "Reset DB before syncing")
  .option("-y, --force", "Skip confirmation prompt for --reset")
  .action(runSync);

program
  .command("report")
  .description("Show token usage report")
  .option("-s, --since <period>", "Time period (e.g. 7d, 30d, 1w, 3m)", "30d")
  .option("-b, --by <grouping>", "Group by: task, model", "task")
  .action(runReport);

program
  .command("verify")
  .description("Verify DB records against raw JSONL (coverage, token, attribution error rates)")
  .option("-d, --detail", "Show per-session mismatch details")
  .option("-s, --session <id>", "Verify a specific session (prefix match)")
  .action(runVerify);

program.parse();
