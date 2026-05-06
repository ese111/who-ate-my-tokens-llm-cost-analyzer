import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import chalk from "chalk";

const require = createRequire(import.meta.url);
const { name, version } = require("../../../package.json");

function fetchLatestVersion(): string | null {
  try {
    const result = execSync(`npm view ${name} version`, { encoding: "utf-8", timeout: 10000 });
    return result.trim();
  } catch {
    return null;
  }
}

export function runUpdate(options: { check?: boolean }) {
  const latest = fetchLatestVersion();

  if (!latest) {
    console.error(chalk.red("Failed to check latest version. Check your network connection."));
    process.exit(1);
  }

  if (latest === version) {
    console.log(chalk.green(`Already up to date (v${version}).`));
    return;
  }

  console.log(chalk.dim(`Current: v${version} → Latest: v${latest}`));

  if (options.check) {
    console.log(chalk.yellow(`Update available. Run 'who-ate-my-tokens update' to install.`));
    return;
  }

  console.log(chalk.dim("Updating..."));
  try {
    execSync(`npm install -g ${name}@latest`, { stdio: "inherit", timeout: 60000 });
    console.log(chalk.green(`Updated to v${latest}.`));
  } catch {
    console.error(chalk.red("Update failed. Try manually: npm install -g " + name));
    process.exit(1);
  }
}
