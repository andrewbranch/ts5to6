import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

function runCLI(args: string[]) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "src/cli.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result;
}

function stripAnsiCodes(text: string): string {
  // Remove ANSI escape codes
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("prints help with --help", () => {
  const { stdout, status } = runCLI(["--help"]);
  assert.equal(status, 0);
  const cleanOutput = stripAnsiCodes(stdout);
  assert.match(cleanOutput, /Usage: ts-fix-baseurl/);
});

test("prints version with --version", () => {
  const { stdout, status } = runCLI(["--version"]);
  assert.equal(status, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+/);
});
