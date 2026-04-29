import chalk from "chalk";
import { Database } from "../../db/schema.js";
import { findAllSessionFiles, parseSessionFile } from "../../parser/jsonl-reader.js";
import { DB_PATH } from "../../shared/config.js";

export function runSync(options: { reset?: boolean }) {
  const db = new Database(DB_PATH);
  try {
    if (options.reset) {
      db.resetAll();
      console.log(chalk.yellow("DB reset complete."));
    }

    const files = findAllSessionFiles();
    console.log(chalk.dim(`Found ${files.length} session files`));

    let totalNew = 0;
    let parsed = 0;

    for (const file of files) {
      try {
        const count = parseSessionFile(file, db);
        if (count > 0) {
          totalNew += count;
          parsed++;
        }
      } catch (e) {
        console.error(chalk.red(`Error parsing ${file}: ${e}`));
      }
    }

    console.log(
      chalk.green(`Sync complete: ${totalNew} new records from ${parsed} files`)
    );
  } finally {
    db.close();
  }
}
