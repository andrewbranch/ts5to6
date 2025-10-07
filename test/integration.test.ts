import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fixIssueSync } from "../src/main.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function createTestLogger() {
  const logs: string[] = [];
  return {
    logs,
    writeLn: (msg: string) => logs.push(msg),
  };
}

function pathInFixture(issueType: "baseUrl" | "rootDir", ...subpath: string[]) {
  return resolve(__dirname, "fixtures", issueType, ...subpath);
}

export function fixturePath(issueType: "baseUrl" | "rootDir", ...subPath: string[]) {
  const path = pathInFixture(issueType, ...subPath);
  return relative(pathInFixture(issueType), path);
}

export function getFixIssueSync(issueType: "baseUrl" | "rootDir", ...fixture: string[]) {
  const path = pathInFixture(issueType, ...fixture);
  const logger = createTestLogger();
  const resultBeforeFixingPaths = fixIssueSync(path, undefined, issueType, logger.writeLn);
  const result: Record<string, string> = {};
  for (const key in resultBeforeFixingPaths) {
    if (Object.prototype.hasOwnProperty.call(resultBeforeFixingPaths, key)) {
      result[relative(pathInFixture(issueType), resolve(key))] = resultBeforeFixingPaths[key];
    }
  }
  return { path: fixturePath(issueType, ...fixture), result };
}
