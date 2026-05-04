import { createInterface } from "node:readline";
import chalk from "chalk";
import { Database } from "../../db/schema.js";
import { syncAdapter } from "../../parser/sync-engine.js";
import { ClaudeAdapter } from "../../adapters/claude.js";
import { CodexAdapter } from "../../adapters/codex.js";
import { GeminiAdapter } from "../../adapters/gemini.js";
import { DB_PATH } from "../../shared/config.js";
import type { LogAdapter } from "../../shared/types.js";

const adapters: LogAdapter[] = [
  new ClaudeAdapter(),
  new CodexAdapter(),
  new GeminiAdapter(),
];

function confirmReset(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      chalk.red("All data will be deleted. Continue? (y/N) "),
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      },
    );
  });
}

export async function runSync(options: { reset?: boolean; yes?: boolean }) {
  const db = new Database(DB_PATH);
  try {
    if (options.reset) {
      if (!options.yes) {
        if (!process.stdin.isTTY) {
          console.error(chalk.red("Cannot prompt in non-interactive mode. Use --yes to skip confirmation."));
          process.exit(1);
        }
        const confirmed = await confirmReset();
        if (!confirmed) {
          console.error(chalk.yellow("Reset cancelled."));
          return;
        }
      }
      db.resetAll();
      console.error(chalk.yellow("DB reset complete."));
    }

    let grandTotal = 0;
    let grandParsed = 0;

    for (const adapter of adapters) {
      const files = adapter.findSessionFiles();
      console.error(chalk.dim(`[${adapter.provider}] Found ${files.length} session files`));

      const { newRecords, parsedFiles } = syncAdapter(adapter, db);
      grandTotal += newRecords;
      grandParsed += parsedFiles;

      if (newRecords > 0) {
        console.error(chalk.dim(`[${adapter.provider}] ${newRecords} new records from ${parsedFiles} files`));
      }
    }

    console.error(chalk.green(`Sync complete: ${grandTotal} new records from ${grandParsed} files`));
  } finally {
    db.close();
  }
}
