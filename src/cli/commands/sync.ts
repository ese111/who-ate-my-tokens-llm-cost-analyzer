import chalk from "chalk";
import { Database } from "../../db/schema.js";
import { syncAdapter } from "../../parser/sync-engine.js";
import { ClaudeAdapter } from "../../adapters/claude.js";
import { DB_PATH } from "../../shared/config.js";
import type { LogAdapter } from "../../shared/types.js";

const adapters: LogAdapter[] = [
  new ClaudeAdapter(),
];

export function runSync(options: { reset?: boolean }) {
  const db = new Database(DB_PATH);
  try {
    if (options.reset) {
      db.resetAll();
      console.log(chalk.yellow("DB reset complete."));
    }

    let grandTotal = 0;
    let grandParsed = 0;

    for (const adapter of adapters) {
      const files = adapter.findSessionFiles();
      console.log(chalk.dim(`[${adapter.provider}] Found ${files.length} session files`));

      const { newRecords, parsedFiles } = syncAdapter(adapter, db);
      grandTotal += newRecords;
      grandParsed += parsedFiles;

      if (newRecords > 0) {
        console.log(chalk.dim(`[${adapter.provider}] ${newRecords} new records from ${parsedFiles} files`));
      }
    }

    console.log(chalk.green(`Sync complete: ${grandTotal} new records from ${grandParsed} files`));
  } finally {
    db.close();
  }
}
