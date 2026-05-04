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

type LogLevel = "quiet" | "normal" | "verbose";

function createLogger(level: LogLevel) {
  return {
    info: (msg: string) => { if (level !== "quiet") console.error(msg); },
    verbose: (msg: string) => { if (level === "verbose") console.error(msg); },
    result: (msg: string) => { console.error(msg); },
  };
}

export async function runSync(options: { reset?: boolean; yes?: boolean; quiet?: boolean; verbose?: boolean }) {
  const level: LogLevel = options.quiet ? "quiet" : options.verbose ? "verbose" : "normal";
  const log = createLogger(level);
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
          log.result(chalk.yellow("Reset cancelled."));
          return;
        }
      }
      db.resetAll();
      log.info(chalk.yellow("DB reset complete."));
    }

    let grandTotal = 0;
    let grandParsed = 0;

    for (const adapter of adapters) {
      const files = adapter.findSessionFiles();
      log.info(chalk.dim(`[${adapter.provider}] Found ${files.length} session files`));

      const { newRecords, parsedFiles } = syncAdapter(adapter, db);
      grandTotal += newRecords;
      grandParsed += parsedFiles;

      if (newRecords > 0) {
        log.info(chalk.dim(`[${adapter.provider}] ${newRecords} new records from ${parsedFiles} files`));
      }
      log.verbose(chalk.dim(`[${adapter.provider}] Parsed ${parsedFiles}/${files.length} files`));
    }

    log.result(chalk.green(`Sync complete: ${grandTotal} new records from ${grandParsed} files`));
    if (grandTotal > 0 && level !== "quiet") {
      log.info(chalk.dim("Run 'who-ate-my-tokens report' to see results."));
    }
  } finally {
    db.close();
  }
}
