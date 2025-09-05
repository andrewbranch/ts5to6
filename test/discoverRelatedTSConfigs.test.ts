import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { discoverRelatedTSConfigs } from "../src/discoverRelatedTSConfigs.ts";
import { getAllTSConfigs } from "../src/getAllTSConfigs.ts";
import { getNonRelativePathsFixes } from "../src/getNonRelativePathsFixes.ts";
import { getNonRelativePathsProblems } from "../src/getNonRelativePathsProblems.ts";
import { getProjects } from "../src/getProjects.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("discoverRelatedTSConfigs - extends scenario fixture", async () => {
  // Test the extends-scenario fixture to ensure we discover tsconfig.other.json
  // when analyzing tsconfig.json (both extend tsconfig.base.json)
  const tsconfigPath = resolve(__dirname, "fixtures", "extends-scenario", "tsconfig.json");
  const projects = getProjects(tsconfigPath);
  const tsconfigs = getAllTSConfigs(projects);

  const workspaceRoot = resolve(__dirname, "fixtures", "extends-scenario");
  const relatedConfigs = await discoverRelatedTSConfigs(tsconfigs, workspaceRoot);

  // Should find tsconfig.other.json since it extends the same base config
  const otherConfigFound = relatedConfigs.some(config => config.fileName.endsWith("tsconfig.other.json"));
  assert(otherConfigFound, "Should discover tsconfig.other.json that extends the same base");

  // Test that we can process all configs together and find problems in both
  const allConfigs = [...tsconfigs, ...relatedConfigs];
  const problems = getNonRelativePathsProblems(allConfigs);

  // Should find problems in multiple configs:
  // 1. tsconfig.base.json with utils/* and components/*
  // 2. tsconfig.other.json with models/*, services/*, shared/*
  assert(problems.length >= 2, `Should find problems in multiple configs, found ${problems.length}`);

  // Verify we found the base config problem
  const baseConfigProblem = problems.find(p => p.tsconfig.fileName.endsWith("tsconfig.base.json"));
  assert(baseConfigProblem, "Should find problems in tsconfig.base.json");

  // Verify we found the other config problem
  const otherConfigProblem = problems.find(p => p.tsconfig.fileName.endsWith("tsconfig.other.json"));
  assert(otherConfigProblem, "Should find problems in tsconfig.other.json");

  // Generate fixes for all problems
  const allFixes = problems.flatMap(getNonRelativePathsFixes);
  assert(allFixes.length >= 5, `Should generate fixes for all non-relative paths, found ${allFixes.length}`);

  // Verify base config fixes
  const baseConfigFixes = allFixes.filter(fix => fix.fileName.endsWith("tsconfig.base.json"));
  assert(baseConfigFixes.length >= 2, "Should have fixes for utils/* and components/* in base config");

  // Verify other config fixes
  const otherConfigFixes = allFixes.filter(fix => fix.fileName.endsWith("tsconfig.other.json"));
  assert(otherConfigFixes.length >= 3, "Should have fixes for models/*, services/*, shared/* in other config");

  // Verify the fixes convert to relative paths
  for (const fix of allFixes) {
    assert(
      fix.newText.includes("./") || fix.newText.includes("../"),
      `Fix should convert to relative path: ${fix.newText}`,
    );
  }
});
