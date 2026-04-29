import BetterSqlite3 from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { TokenRecord, ParseState, TaskUsageRow } from "../shared/types.js";

export class Database {
  private db: BetterSqlite3.Database;

  private static readonly MIGRATIONS: { version: number; sql: string[] }[] = [
    {
      version: 1,
      sql: [
        "ALTER TABLE token_records ADD COLUMN request_id TEXT",
        "ALTER TABLE token_records ADD COLUMN git_branch TEXT",
        "ALTER TABLE token_records ADD COLUMN raw_source TEXT",
      ],
    },
  ];

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.createTables();
    this.runMigrations();
  }

  private runMigrations() {
    const currentVersion = (this.db.pragma("user_version", { simple: true }) as number) ?? 0;
    for (const migration of Database.MIGRATIONS) {
      if (migration.version > currentVersion) {
        const tx = this.db.transaction(() => {
          for (const sql of migration.sql) {
            this.db.exec(sql);
          }
          this.db.pragma(`user_version = ${migration.version}`);
        });
        tx();
      }
    }
  }

  private migrateParseState() {
    const hasColumn = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM pragma_table_info('parse_state') WHERE name = 'active_trigger'"
    ).get() as { cnt: number } | undefined;
    if (hasColumn && hasColumn.cnt === 0) {
      this.db.exec("DROP TABLE IF EXISTS parse_state");
    }
  }

  private createTables() {
    this.migrateParseState();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_records (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id          TEXT NOT NULL,
        project_path        TEXT NOT NULL,
        provider            TEXT NOT NULL DEFAULT 'claude',
        message_id          TEXT NOT NULL UNIQUE,
        timestamp           TEXT NOT NULL,
        model               TEXT NOT NULL,
        input_tokens        INTEGER DEFAULT 0,
        output_tokens       INTEGER DEFAULT 0,
        cache_read_tokens   INTEGER DEFAULT 0,
        cache_create_tokens INTEGER DEFAULT 0,
        reasoning_tokens    INTEGER DEFAULT 0,
        task_name           TEXT,
        trigger_type        TEXT DEFAULT 'none'
      );

      CREATE TABLE IF NOT EXISTS parse_state (
        source_key          TEXT PRIMARY KEY,
        last_byte_offset    INTEGER NOT NULL,
        last_file_size      INTEGER NOT NULL,
        last_mtime_ms       INTEGER NOT NULL,
        last_parsed_at      TEXT NOT NULL,
        active_skill        TEXT,
        active_prompt_id    TEXT,
        active_trigger      TEXT DEFAULT 'none'
      );

      CREATE INDEX IF NOT EXISTS idx_task_timestamp ON token_records(task_name, timestamp);
      CREATE INDEX IF NOT EXISTS idx_session ON token_records(session_id);
      CREATE INDEX IF NOT EXISTS idx_model ON token_records(model);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON token_records(timestamp);
    `);
  }

  insertTokenRecords(records: TokenRecord[]) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO token_records
        (session_id, project_path, provider, message_id, timestamp, model,
         input_tokens, output_tokens, cache_read_tokens, cache_create_tokens,
         reasoning_tokens, task_name, trigger_type,
         request_id, git_branch, raw_source)
      VALUES
        (@session_id, @project_path, @provider, @message_id, @timestamp, @model,
         @input_tokens, @output_tokens, @cache_read_tokens, @cache_create_tokens,
         @reasoning_tokens, @task_name, @trigger_type,
         @request_id, @git_branch, @raw_source)
    `);
    const tx = this.db.transaction((recs: TokenRecord[]) => {
      for (const r of recs) stmt.run(r);
    });
    tx(records);
  }

  getParseState(sourceKey: string): ParseState | null {
    return this.db.prepare("SELECT * FROM parse_state WHERE source_key = ?")
      .get(sourceKey) as ParseState | null;
  }

  updateParseState(state: ParseState & { active_skill?: string | null; active_prompt_id?: string | null; active_trigger?: string | null }) {
    this.db.prepare(`
      INSERT OR REPLACE INTO parse_state
        (source_key, last_byte_offset, last_file_size, last_mtime_ms, last_parsed_at, active_skill, active_prompt_id, active_trigger)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      state.source_key,
      state.last_byte_offset,
      state.last_file_size,
      state.last_mtime_ms,
      new Date().toISOString(),
      state.active_skill ?? null,
      state.active_prompt_id ?? null,
      state.active_trigger ?? "none",
    );
  }

  getExistingMessageIds(sessionId: string): Set<string> {
    const rows = this.db.prepare("SELECT message_id FROM token_records WHERE session_id = ?")
      .all(sessionId) as { message_id: string }[];
    return new Set(rows.map(r => r.message_id));
  }

  getActiveSkill(sourceKey: string): string | null {
    const row = this.db.prepare("SELECT active_skill FROM parse_state WHERE source_key = ?")
      .get(sourceKey) as { active_skill: string | null } | undefined;
    return row?.active_skill ?? null;
  }

  getActivePromptId(sourceKey: string): string | null {
    const row = this.db.prepare("SELECT active_prompt_id FROM parse_state WHERE source_key = ?")
      .get(sourceKey) as { active_prompt_id: string | null } | undefined;
    return row?.active_prompt_id ?? null;
  }

  getActiveTrigger(sourceKey: string): TokenRecord["trigger_type"] {
    const row = this.db.prepare("SELECT active_trigger FROM parse_state WHERE source_key = ?")
      .get(sourceKey) as { active_trigger: string | null } | undefined;
    const val = row?.active_trigger;
    if (val === "user_slash" || val === "model_tool_call") return val;
    return "none";
  }

  queryByTask(sinceDate: string): TaskUsageRow[] {
    const rows = this.db.prepare(`
      SELECT
        COALESCE(task_name, '(general)') as task_name,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        SUM(cache_read_tokens) as total_cache_read,
        SUM(cache_create_tokens) as total_cache_create,
        SUM(reasoning_tokens) as total_reasoning,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_create_tokens + reasoning_tokens) as total_tokens
      FROM token_records
      WHERE timestamp >= ? AND provider = 'claude'
      GROUP BY COALESCE(task_name, '(general)')
      ORDER BY total_tokens DESC
    `).all(sinceDate) as { task_name: string; total_input: number; total_output: number; total_cache_read: number; total_cache_create: number; total_reasoning: number; total_tokens: number }[];

    const runCounts = this.countRuns(sinceDate);

    return rows.map(r => {
      const runs = runCounts.get(r.task_name) ?? 0;
      return {
        ...r,
        runs,
        invocation_count: runs,
        avg_tokens_per_run: runs > 0 ? Math.round(r.total_tokens / runs) : 0,
      };
    });
  }

  private countRuns(sinceDate: string): Map<string, number> {
    const rows = this.db.prepare(`
      SELECT task_name, COUNT(*) as run_count
      FROM (
        SELECT
          COALESCE(task_name, '(general)') as task_name,
          LAG(COALESCE(task_name, '(general)')) OVER (
            PARTITION BY session_id ORDER BY timestamp, id
          ) as prev_task
        FROM token_records
        WHERE timestamp >= ? AND provider = 'claude'
      )
      WHERE task_name != prev_task OR prev_task IS NULL
      GROUP BY task_name
    `).all(sinceDate) as { task_name: string; run_count: number }[];

    return new Map(rows.map(r => [r.task_name, r.run_count]));
  }

  queryByModel(sinceDate: string) {
    return this.db.prepare(`
      SELECT
        model,
        COUNT(*) as message_count,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        SUM(cache_read_tokens) as total_cache_read,
        SUM(cache_create_tokens) as total_cache_create,
        SUM(reasoning_tokens) as total_reasoning,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_create_tokens + reasoning_tokens) as total_tokens
      FROM token_records
      WHERE timestamp >= ? AND provider = 'claude'
      GROUP BY model
      ORDER BY total_tokens DESC
    `).all(sinceDate);
  }

  getTotalStats(sinceDate: string) {
    return this.db.prepare(`
      SELECT
        COUNT(DISTINCT session_id) as sessions,
        COUNT(*) as messages,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        SUM(cache_read_tokens) as total_cache_read,
        SUM(cache_create_tokens) as total_cache_create,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_create_tokens + reasoning_tokens) as total_tokens
      FROM token_records
      WHERE timestamp >= ? AND provider = 'claude'
    `).get(sinceDate) as Record<string, number>;
  }

  getRecordsBySession(sessionId: string) {
    return this.db.prepare(`
      SELECT message_id, input_tokens, output_tokens, cache_read_tokens,
             cache_create_tokens, reasoning_tokens, task_name, trigger_type
      FROM token_records
      WHERE session_id = ?
    `).all(sessionId) as {
      message_id: string;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_create_tokens: number;
      reasoning_tokens: number;
      task_name: string | null;
      trigger_type: string;
    }[];
  }

  resetAll() {
    this.db.exec("DELETE FROM token_records; DELETE FROM parse_state;");
  }

  close() {
    this.db.close();
  }
}
