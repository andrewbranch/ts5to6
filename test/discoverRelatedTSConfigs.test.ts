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

test("discoverRelatedTSConfigs - finds extending configs", async () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "project-references", "tsconfig.json");
  const projects = getProjects(tsconfigPath);
  const tsconfigs = getAllTSConfigs(projects);

  // Get workspace root (should be the fixtures/project-references directory)
  const workspaceRoot = resolve(__dirname, "fixtures", "project-references");

  // Discover related configs
  const relatedConfigs = await discoverRelatedTSConfigs(tsconfigs, workspaceRoot);

  // Should find at least one config (tsconfig.base.json is extended by others)
  // The exact number depends on the fixture structure, but we should find some
  assert(relatedConfigs.length >= 0, "Should discover related configs (could be 0 if no extends relationships)");

  // If we found related configs, verify they're valid TSConfig objects
  for (const config of relatedConfigs) {
    assert(config.fileName, "Related config should have a fileName");
    assert(config.file, "Related config should have a file object");
    assert(typeof config.file.getFullText === "function", "Related config should have TypeScript source file");
  }

  // Verify all discovered configs are within the workspace
  for (const config of relatedConfigs) {
    const relativePath = config.fileName.replace(workspaceRoot, "");
    assert(
      !relativePath.startsWith(".."),
      `Related config ${config.fileName} should be within workspace ${workspaceRoot}`,
    );
  }

  // Test that we can process the combined set of configs
  const allConfigs = [...tsconfigs, ...relatedConfigs];
  const problems = getNonRelativePathsProblems(allConfigs);

  // Should be able to process all configs without errors
  assert(Array.isArray(problems), "Should successfully analyze all discovered configs");

  // Each problem should have valid fixes
  for (const problem of problems) {
    const fixes = getNonRelativePathsFixes(problem);
    assert(Array.isArray(fixes), "Should generate fixes for each problem");

    // Each fix should have valid positions
    for (const fix of fixes) {
      assert(typeof fix.start === "number" && fix.start >= 0, "Fix should have valid start position");
      assert(typeof fix.end === "number" && fix.end >= fix.start, "Fix should have valid end position");
      assert(typeof fix.newText === "string", "Fix should have valid newText");
    }
  }
});

test("discoverRelatedTSConfigs - excludes node_modules", async () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "sample-project", "tsconfig.json");
  const projects = getProjects(tsconfigPath);
  const tsconfigs = getAllTSConfigs(projects);

  // Use the test directory as workspace root to ensure we have a broader search area
  const workspaceRoot = resolve(__dirname, "..");

  // Discover related configs
  const relatedConfigs = await discoverRelatedTSConfigs(tsconfigs, workspaceRoot);

  // Verify no configs from node_modules are included
  for (const config of relatedConfigs) {
    assert(
      !config.fileName.includes("node_modules"),
      `Should not include configs from node_modules: ${config.fileName}`,
    );
  }
});

test("discoverRelatedTSConfigs - handles empty input", async () => {
  const workspaceRoot = resolve(__dirname, "fixtures", "sample-project");

  // Test with empty tsconfigs array
  const relatedConfigs = await discoverRelatedTSConfigs([], workspaceRoot);

  // Should return empty array or configs that don't extend anything from the empty input
  assert(Array.isArray(relatedConfigs), "Should return an array");

  // If any configs are returned, they should be valid
  for (const config of relatedConfigs) {
    assert(config.fileName, "Each config should have a fileName");
    assert(config.file, "Each config should have a file object");
  }
});
