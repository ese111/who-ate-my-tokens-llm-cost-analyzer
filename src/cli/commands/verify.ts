import chalk from "chalk";
import Table from "cli-table3";
import { readFileSync } from "node:fs";
import { Database } from "../../db/schema.js";
import { DB_PATH } from "../../shared/config.js";
import { findAllSessionFiles, extractSessionId } from "../../parser/jsonl-reader.js";
import { detectSkillFromUser, detectSkillFromAssistant } from "../../parser/skill-detector.js";
import type { RawJsonlEntry, TokenRecord } from "../../shared/types.js";

interface FreshRecord {
  message_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  task_name: string | null;
  trigger_type: TokenRecord["trigger_type"];
}

interface SessionVerifyResult {
  session_id: string;
  file_path: string;
  jsonl_count: number;
  db_count: number;
  missing_in_db: number;
  extra_in_db: number;
  token_mismatches: number;
  attribution_mismatches: number;
  jsonl_total_tokens: number;
  db_total_tokens: number;
  mismatched_details: MismatchDetail[];
}

interface MismatchDetail {
  message_id: string;
  type: "missing_in_db" | "extra_in_db" | "token_mismatch" | "attribution_mismatch";
  jsonl?: { tokens: number; task: string | null };
  db?: { tokens: number; task: string | null };
}

function freshParseSession(filePath: string): Map<string, FreshRecord> {
  const buf = readFileSync(filePath, "utf-8");
  const lines = buf.split("\n").filter(l => l.trim());

  let activeSkill: string | null = null;
  let activeTrigger: TokenRecord["trigger_type"] = "none";
  let activePromptId: string | null = null;

  const latestByMsgId = new Map<string, FreshRecord>();

  for (const line of lines) {
    let entry: RawJsonlEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const userSkill = detectSkillFromUser(entry);
    if (userSkill) {
      activeSkill = userSkill.name;
      activeTrigger = userSkill.trigger_type;
      activePromptId = entry.promptId ?? null;
      continue;
    }

    if (entry.type === "user" && entry.promptId && entry.promptId !== activePromptId) {
      activeSkill = null;
      activeTrigger = "none";
      activePromptId = entry.promptId;
    }

    const modelSkill = detectSkillFromAssistant(entry);
    if (modelSkill) {
      activeSkill = modelSkill.name;
      activeTrigger = modelSkill.trigger_type;
    }

    if (entry.type === "assistant" && entry.message?.id && entry.message?.usage) {
      const usage = entry.message.usage;
      latestByMsgId.set(entry.message.id, {
        message_id: entry.message.id,
        model: entry.message.model ?? "unknown",
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_read_tokens: usage.cache_read_input_tokens ?? 0,
        cache_create_tokens: usage.cache_creation_input_tokens ?? 0,
        task_name: activeSkill,
        trigger_type: activeTrigger,
      });
    }
  }

  return latestByMsgId;
}

function sumTokens(r: { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_create_tokens: number }): number {
  return r.input_tokens + r.output_tokens + r.cache_read_tokens + r.cache_create_tokens;
}

function verifySession(filePath: string, db: Database): SessionVerifyResult {
  const sessionId = extractSessionId(filePath);
  const freshRecords = freshParseSession(filePath);

  const dbRows = db.getRecordsBySession(sessionId);
  const dbMap = new Map<string, typeof dbRows[number]>();
  for (const row of dbRows) {
    dbMap.set(row.message_id, row);
  }

  const mismatched: MismatchDetail[] = [];
  let tokenMismatches = 0;
  let attributionMismatches = 0;
  let jsonlTotal = 0;
  let dbTotal = 0;

  // Check JSONL records against DB
  for (const [msgId, fresh] of freshRecords) {
    const freshTokens = sumTokens(fresh);
    jsonlTotal += freshTokens;

    const dbRow = dbMap.get(msgId);
    if (!dbRow) {
      mismatched.push({
        message_id: msgId,
        type: "missing_in_db",
        jsonl: { tokens: freshTokens, task: fresh.task_name },
      });
      continue;
    }

    const dbTokens = dbRow.input_tokens + dbRow.output_tokens + dbRow.cache_read_tokens + dbRow.cache_create_tokens;

    if (freshTokens !== dbTokens) {
      tokenMismatches++;
      mismatched.push({
        message_id: msgId,
        type: "token_mismatch",
        jsonl: { tokens: freshTokens, task: fresh.task_name },
        db: { tokens: dbTokens, task: dbRow.task_name },
      });
    }

    const freshTask = fresh.task_name ?? "(general)";
    const dbTask = dbRow.task_name ?? "(general)";
    if (freshTask !== dbTask) {
      attributionMismatches++;
      mismatched.push({
        message_id: msgId,
        type: "attribution_mismatch",
        jsonl: { tokens: freshTokens, task: fresh.task_name },
        db: { tokens: dbTokens, task: dbRow.task_name },
      });
    }
  }

  // Check for extra records in DB not in JSONL
  const extraInDb: MismatchDetail[] = [];
  for (const [msgId, dbRow] of dbMap) {
    if (!freshRecords.has(msgId)) {
      const dbTokens = dbRow.input_tokens + dbRow.output_tokens + dbRow.cache_read_tokens + dbRow.cache_create_tokens;
      extraInDb.push({
        message_id: msgId,
        type: "extra_in_db",
        db: { tokens: dbTokens, task: dbRow.task_name },
      });
    }
  }

  for (const row of dbMap.values()) {
    dbTotal += row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_create_tokens;
  }

  return {
    session_id: sessionId,
    file_path: filePath,
    jsonl_count: freshRecords.size,
    db_count: dbMap.size,
    missing_in_db: mismatched.filter(m => m.type === "missing_in_db").length,
    extra_in_db: extraInDb.length,
    token_mismatches: tokenMismatches,
    attribution_mismatches: attributionMismatches,
    jsonl_total_tokens: jsonlTotal,
    db_total_tokens: dbTotal,
    mismatched_details: [...mismatched, ...extraInDb],
  };
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return (n / total * 100).toFixed(1) + "%";
}

function fmtTokensShort(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}

export function runVerify(options: { detail?: boolean; session?: string }) {
  const db = new Database(DB_PATH);

  try {
    const files = findAllSessionFiles();

    const filteredFiles = options.session
      ? files.filter(f => extractSessionId(f).startsWith(options.session!))
      : files;

    if (filteredFiles.length === 0) {
      console.log(chalk.yellow("No session files found."));
      return;
    }

    console.log(chalk.dim(`Verifying ${filteredFiles.length} session files...\n`));

    let totalJsonlMsgs = 0;
    let totalDbMsgs = 0;
    let totalMissing = 0;
    let totalExtra = 0;
    let totalTokenMismatch = 0;
    let totalAttrMismatch = 0;
    let totalJsonlTokens = 0;
    let totalDbTokens = 0;
    let problemSessions: SessionVerifyResult[] = [];

    for (const file of filteredFiles) {
      try {
        const result = verifySession(file, db);
        totalJsonlMsgs += result.jsonl_count;
        totalDbMsgs += result.db_count;
        totalMissing += result.missing_in_db;
        totalExtra += result.extra_in_db;
        totalTokenMismatch += result.token_mismatches;
        totalAttrMismatch += result.attribution_mismatches;
        totalJsonlTokens += result.jsonl_total_tokens;
        totalDbTokens += result.db_total_tokens;

        if (result.mismatched_details.length > 0) {
          problemSessions.push(result);
        }
      } catch (e) {
        console.error(chalk.red(`Error verifying ${file}: ${e}`));
      }
    }

    // Summary table
    console.log(chalk.bold("Verification Summary"));
    console.log();

    const summaryTable = new Table({ style: { head: [], border: [] } });
    summaryTable.push(
      [chalk.cyan("JSONL messages"), totalJsonlMsgs.toLocaleString()],
      [chalk.cyan("DB records"), totalDbMsgs.toLocaleString()],
      [chalk.cyan("JSONL total tokens"), fmtTokensShort(totalJsonlTokens)],
      [chalk.cyan("DB total tokens"), fmtTokensShort(totalDbTokens)],
      [chalk.cyan("Token diff"), fmtTokensShort(Math.abs(totalJsonlTokens - totalDbTokens))],
    );
    console.log(summaryTable.toString());
    console.log();

    // Error rates
    const errTable = new Table({
      head: [chalk.cyan("Check"), chalk.cyan("Errors"), chalk.cyan("Rate")],
      style: { head: [], border: [] },
    });

    const coverageMissing = totalMissing;
    const coverageExtra = totalExtra;

    errTable.push(
      ["Coverage (missing in DB)", String(coverageMissing), pct(coverageMissing, totalJsonlMsgs)],
      ["Coverage (extra in DB)", String(coverageExtra), pct(coverageExtra, totalDbMsgs)],
      ["Token mismatch", String(totalTokenMismatch), pct(totalTokenMismatch, totalJsonlMsgs)],
      ["Attribution mismatch", String(totalAttrMismatch), pct(totalAttrMismatch, totalJsonlMsgs)],
    );
    console.log(errTable.toString());
    console.log();

    // Overall verdict
    const totalErrors = coverageMissing + coverageExtra + totalTokenMismatch + totalAttrMismatch;
    if (totalErrors === 0) {
      console.log(chalk.green("All records match. No discrepancies found."));
    } else {
      console.log(chalk.yellow(`${totalErrors} discrepancies found in ${problemSessions.length} sessions.`));
    }

    // Detail mode
    if (options.detail && problemSessions.length > 0) {
      console.log();
      console.log(chalk.bold("Mismatch Details"));
      console.log();

      for (const session of problemSessions) {
        console.log(chalk.white(`Session: ${session.session_id}`));

        const detailTable = new Table({
          head: [
            chalk.dim("message_id"),
            chalk.dim("type"),
            chalk.dim("JSONL"),
            chalk.dim("DB"),
          ],
          style: { head: [], border: [] },
          colWidths: [26, 22, 30, 30],
          wordWrap: true,
        });

        for (const d of session.mismatched_details.slice(0, 20)) {
          const msgShort = d.message_id.slice(0, 22) + "...";
          const jsonlStr = d.jsonl
            ? `${fmtTokensShort(d.jsonl.tokens)} → ${d.jsonl.task ?? "(general)"}`
            : "-";
          const dbStr = d.db
            ? `${fmtTokensShort(d.db.tokens)} → ${d.db.task ?? "(general)"}`
            : "-";
          detailTable.push([msgShort, d.type, jsonlStr, dbStr]);
        }

        console.log(detailTable.toString());

        if (session.mismatched_details.length > 20) {
          console.log(chalk.dim(`  ... and ${session.mismatched_details.length - 20} more`));
        }
        console.log();
      }
    }
  } finally {
    db.close();
  }
}
