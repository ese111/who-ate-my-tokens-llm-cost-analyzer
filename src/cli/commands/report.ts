import chalk from "chalk";
import Table from "cli-table3";
import { Database } from "../../db/schema.js";
import { DB_PATH } from "../../shared/config.js";
import { estimateCost } from "../../shared/pricing.js";
import { fmtNum, fmtTokensShort } from "../../shared/format.js";

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

export function runReport(options: { since: string; by: string; provider?: string; json?: boolean }) {
  const db = new Database(DB_PATH);
  try {
    const sinceDate = parseSince(options.since);
    const sinceLabel = new Date(sinceDate).toLocaleDateString("ko-KR");
    const provider = options.provider;
    const validGroupings = ["task", "skill", "model", "provider"];

    if (!validGroupings.includes(options.by)) {
      console.error(`Invalid --by value: "${options.by}". Use: ${validGroupings.join(", ")}`);
      process.exit(1);
    }

    if (options.json) {
      reportJson(db, sinceDate, options.by, provider);
      return;
    }

    if (options.by === "task" || options.by === "skill") {
      reportByTask(db, sinceDate, sinceLabel, provider);
    } else if (options.by === "model") {
      reportByModel(db, sinceDate, sinceLabel, provider);
    } else if (options.by === "provider") {
      reportByProvider(db, sinceDate, sinceLabel);
    }
  } finally {
    db.close();
  }
}

function reportJson(db: Database, sinceDate: string, by: string, provider?: string) {
  let data: unknown;
  if (by === "task" || by === "skill") {
    data = db.queryByTask(sinceDate, provider);
  } else if (by === "model") {
    data = db.queryByModel(sinceDate, provider);
  } else {
    data = db.queryByProvider(sinceDate);
  }
  console.log(JSON.stringify(data, null, 2));
}

function reportByTask(db: Database, sinceDate: string, sinceLabel: string, provider?: string) {
  const stats = db.getTotalStats(sinceDate, provider);
  const rows = db.queryByTask(sinceDate, provider);

  if (rows.length === 0) {
    console.log(chalk.yellow("No data found. Run 'who-ate-my-tokens sync' first."));
    return;
  }

  console.log();
  const providerLabel = provider ? ` [${provider}]` : "";
  console.log(chalk.bold(`Skill/Task Token Usage${providerLabel} (since ${sinceLabel})`));
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

function reportByModel(db: Database, sinceDate: string, sinceLabel: string, provider?: string) {
  const rows = db.queryByModel(sinceDate, provider);

  if (rows.length === 0) {
    console.log(chalk.yellow("No data found. Run 'sync' first."));
    return;
  }

  const providerLabel = provider ? ` [${provider}]` : "";
  console.log();
  console.log(chalk.bold(`Token Usage by Model${providerLabel} (since ${sinceLabel})`));
  console.log();

  const table = new Table({
    head: [
      chalk.cyan("Provider"),
      chalk.cyan("Model"),
      chalk.cyan("Calls"),
      chalk.cyan("Input"),
      chalk.cyan("Output"),
      chalk.cyan("Cache Read"),
      chalk.cyan("Cache Create"),
      chalk.cyan("Total"),
      chalk.cyan("Est. Cost"),
    ],
    colAligns: ["left", "left", "right", "right", "right", "right", "right", "right", "right"],
    style: { head: [], border: [] },
  });

  for (const row of rows) {
    const cost = estimateCost(row.model, row.total_input, row.total_output, row.total_cache_read, row.total_cache_create);
    table.push([
      chalk.dim(row.provider),
      chalk.white(row.model),
      fmtNum(row.message_count),
      fmtNum(row.total_input),
      fmtNum(row.total_output),
      fmtNum(row.total_cache_read),
      fmtNum(row.total_cache_create),
      chalk.bold(fmtTokensShort(row.total_tokens)),
      cost !== null ? chalk.yellow(`$${cost.toFixed(2)}`) : chalk.dim("N/A"),
    ]);
  }

  console.log(table.toString());
  console.log();
}

function reportByProvider(db: Database, sinceDate: string, sinceLabel: string) {
  const rows = db.queryByProvider(sinceDate);

  if (rows.length === 0) {
    console.log(chalk.yellow("No data found. Run 'sync' first."));
    return;
  }

  console.log();
  console.log(chalk.bold(`Token Usage by Provider (since ${sinceLabel})`));
  console.log();

  const table = new Table({
    head: [
      chalk.cyan("Provider"),
      chalk.cyan("Sessions"),
      chalk.cyan("Calls"),
      chalk.cyan("Input"),
      chalk.cyan("Output"),
      chalk.cyan("Cache Read"),
      chalk.cyan("Reasoning"),
      chalk.cyan("Total"),
    ],
    colAligns: ["left", "right", "right", "right", "right", "right", "right", "right"],
    style: { head: [], border: [] },
  });

  let grandTotal = 0;
  for (const row of rows) {
    grandTotal += row.total_tokens;
    table.push([
      chalk.white(row.provider),
      fmtNum(row.sessions),
      fmtNum(row.messages),
      fmtNum(row.total_input),
      fmtNum(row.total_output),
      fmtNum(row.total_cache_read),
      fmtNum(row.total_reasoning),
      chalk.bold(fmtTokensShort(row.total_tokens)),
    ]);
  }

  table.push([
    chalk.bold("Total"), "", "", "", "", "", "",
    chalk.bold.green(fmtTokensShort(grandTotal)),
  ]);

  console.log(table.toString());
  console.log();
}
