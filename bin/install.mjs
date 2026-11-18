#!/usr/bin/env node
// Thin, dependency-free npm entrypoint for the canonical Python installer.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const installer = join(root, "scripts", "install.py");
const args = process.argv.slice(2);
const commands = process.platform === "win32"
  ? [["py", ["-3"]], ["python", []], ["python3", []]]
  : [["python3", []], ["python", []]];

for (const [command, prefix] of commands) {
  const result = spawnSync(command, [...prefix, installer, ...args], { stdio: "inherit" });
  if (result.error?.code === "ENOENT") continue;
  if (result.error) {
    console.error(`Unable to start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
console.error("Python 3.11+ is required. Install Python and retry.");
process.exit(1);
