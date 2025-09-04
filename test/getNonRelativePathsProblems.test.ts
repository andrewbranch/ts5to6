import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { getAllTSConfigs } from "../src/getAllTSConfigs.ts";
import { getNonRelativePathsProblems } from "../src/getNonRelativePathsProblems.ts";
import { getProjects } from "../src/getProjects.ts";

test("project references", () => {
  const tsconfigPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures",
    "project-references",
    "tsconfig.json",
  );
  const projects = getProjects(tsconfigPath);
  const tsconfigs = getAllTSConfigs(projects);
  const problems = getNonRelativePathsProblems(tsconfigs);
  assert.equal(problems.length, 2);
  assert.equal(problems[0].tsconfig.path, resolve(dirname(tsconfigPath), "tsconfig.base.json"));
  assert.equal(problems[1].tsconfig.path, resolve(dirname(tsconfigPath), "packages", "server", "tsconfig.json"));
});
