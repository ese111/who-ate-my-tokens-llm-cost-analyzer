import chalk from "chalk";
import Table from "cli-table3";
import { Database } from "../../db/schema.js";
import { DB_PATH } from "../../shared/config.js";

function parseSince(since: string): string {
  const now = new Date();
  const match = since.match(/^(\d+)([dhwm])$/);
  if (match) {
    const n = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
      case "d": now.setDate(now.getDate() - n); break;
      case "h": now.setHours(now.getHours() - n); break;
      case "w": now.setDate(now.getDate() - n * 7); break;
      case "m": now.setMonth(now.getMonth() - n); break;
    }
    return now.toISOString();
  }
  // Try as ISO date
  const parsed = new Date(since);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  console.error(`Invalid --since format: "${since}". Use 7d, 2w, 3m, or ISO date.`);
  process.exit(1);
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtTokensShort(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}

export function runReport(options: { since: string; by: string }) {
  const db = new Database(DB_PATH);
  try {
    const sinceDate = parseSince(options.since);
    const sinceLabel = new Date(sinceDate).toLocaleDateString("ko-KR");

    if (options.by === "task" || options.by === "skill") {
      reportByTask(db, sinceDate, sinceLabel);
    } else if (options.by === "model") {
      reportByModel(db, sinceDate, sinceLabel);
    } else {
      reportByTask(db, sinceDate, sinceLabel);
    }
  } finally {
    db.close();
  }
}

function reportByTask(db: Database, sinceDate: string, sinceLabel: string) {
  const stats = db.getTotalStats(sinceDate);
  const rows = db.queryByTask(sinceDate);

  if (rows.length === 0) {
    console.log(chalk.yellow("No data found. Run 'skills-token sync' first."));
    return;
  }

  console.log();
  console.log(chalk.bold(`Skill/Task Token Usage (since ${sinceLabel})`));
  console.log(chalk.dim(`${stats.sessions} sessions, ${stats.messages} API calls`));
  console.log();

  const table = new Table({
    head: [
      chalk.cyan("Task"),
      chalk.cyan("Runs"),
      chalk.cyan("Input"),
      chalk.cyan("Output"),
      chalk.cyan("Cache Read"),
      chalk.cyan("Cache Create"),
      chalk.cyan("Total"),
      chalk.cyan("Avg/Run"),
    ],
    colAligns: ["left", "right", "right", "right", "right", "right", "right", "right"],
    style: { head: [], border: [] },
  });

  let grandTotal = 0;

  for (const row of rows) {
    const total = row.total_tokens;
    grandTotal += total;
    table.push([
      row.task_name === "(general)" ? chalk.dim("(general)") : chalk.white(row.task_name),
      String(row.runs),
      fmtNum(row.total_input),
      fmtNum(row.total_output),
      fmtNum(row.total_cache_read),
      fmtNum(row.total_cache_create),
      chalk.bold(fmtTokensShort(total)),
      chalk.dim(fmtTokensShort(row.avg_tokens_per_run)),
    ]);
  }

  table.push([
    chalk.bold("Total"),
    "",
    "",
    "",
    "",
    "",
    chalk.bold.green(fmtTokensShort(grandTotal)),
    "",
  ]);

  console.log(table.toString());
  console.log();
}

function reportByModel(db: Database, sinceDate: string, sinceLabel: string) {
  const rows = db.queryByModel(sinceDate) as Array<{
    model: string;
    message_count: number;
    total_input: number;
    total_output: number;
    total_cache_read: number;
    total_cache_create: number;
    total_tokens: number;
  }>;

  if (rows.length === 0) {
    console.log(chalk.yellow("No data found. Run 'skills-token sync' first."));
    return;
  }

  console.log();
  console.log(chalk.bold(`Token Usage by Model (since ${sinceLabel})`));
  console.log();

  const table = new Table({
    head: [
      chalk.cyan("Model"),
      chalk.cyan("Calls"),
      chalk.cyan("Input"),
      chalk.cyan("Output"),
      chalk.cyan("Cache Read"),
      chalk.cyan("Cache Create"),
      chalk.cyan("Total"),
    ],
    colAligns: ["left", "right", "right", "right", "right", "right", "right"],
    style: { head: [], border: [] },
  });

  for (const row of rows) {
    table.push([
      chalk.white(row.model),
      fmtNum(row.message_count),
      fmtNum(row.total_input),
      fmtNum(row.total_output),
      fmtNum(row.total_cache_read),
      fmtNum(row.total_cache_create),
      chalk.bold(fmtTokensShort(row.total_tokens)),
    ]);
  }

  console.log(table.toString());
  console.log();
}
