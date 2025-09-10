import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "../src/configStore.ts";
import { getNonRelativePathsFixes } from "../src/getNonRelativePathsFixes.ts";
import { getNonRelativePathsProblems } from "../src/getNonRelativePathsProblems.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("getNonRelativePathsFixes - project references fixture", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "project-references", "tsconfig.json");
  const configStore = new ConfigStore();
  configStore.loadProjects(tsconfigPath);
  const problems = getNonRelativePathsProblems(configStore.getConfigs().containsPaths, configStore);

  // Should find 2 problems: tsconfig.base.json and server/tsconfig.json
  assert.equal(problems.length, 2);

  // Test fixing the base config problem
  const baseConfigProblem = problems.find(p => p.tsconfig.fileName.endsWith("tsconfig.base.json"));
  assert(baseConfigProblem, "Should find base config problem");

  const baseConfigEdits = getNonRelativePathsFixes(baseConfigProblem);
  assert.equal(baseConfigEdits.length, 2, "Should have 2 edits for @shared paths");

  // Check that paths are made relative to the base config location
  const utilsEdit = baseConfigEdits.find(edit => edit.newText.includes("shared/src/utils"));
  const typesEdit = baseConfigEdits.find(edit => edit.newText.includes("shared/src/types"));

  assert(utilsEdit, "Should have edit for utils path");
  assert(typesEdit, "Should have edit for types path");

  // Should convert "packages/shared/src/utils" to "./packages/shared/src/utils"
  assert.equal(utilsEdit.newText, "\"./packages/shared/src/utils\"");
  assert.equal(typesEdit.newText, "\"./packages/shared/src/types\"");

  // Verify positions using indexOf on the actual file text
  const baseConfigText = baseConfigProblem.tsconfig.file.getFullText();
  const utilsStringPos = baseConfigText.indexOf("\"packages/shared/src/utils\"");
  const typesStringPos = baseConfigText.indexOf("\"packages/shared/src/types\"");

  assert(utilsStringPos !== -1, "Should find utils string in base config");
  assert(typesStringPos !== -1, "Should find types string in base config");

  // Text edits should target the exact positions of these strings
  assert.equal(utilsEdit.start, utilsStringPos, "Utils edit should start at correct position");
  assert.equal(
    utilsEdit.end,
    utilsStringPos + "\"packages/shared/src/utils\"".length,
    "Utils edit should end at correct position",
  );
  assert.equal(typesEdit.start, typesStringPos, "Types edit should start at correct position");
  assert.equal(
    typesEdit.end,
    typesStringPos + "\"packages/shared/src/types\"".length,
    "Types edit should end at correct position",
  );

  // Test fixing the server config problem
  const serverConfigProblem = problems.find(p =>
    p.tsconfig.fileName.includes("server") && p.tsconfig.fileName.endsWith("tsconfig.json")
  );
  assert(serverConfigProblem, "Should find server config problem");

  const serverConfigEdits = getNonRelativePathsFixes(serverConfigProblem);
  assert.equal(serverConfigEdits.length, 2, "Should have 2 edits for server @shared paths");

  // Server paths should be relative to server directory
  const serverUtilsEdit = serverConfigEdits.find(edit => edit.newText.includes("shared/src/utils"));
  const serverTypesEdit = serverConfigEdits.find(edit => edit.newText.includes("shared/src/types"));

  assert(serverUtilsEdit, "Should have edit for server utils path");
  assert(serverTypesEdit, "Should have edit for server types path");

  // Should convert "packages/shared/src/utils" to "../shared/src/utils"
  // (relative from server packages/server/ to packages/shared/src/utils)
  assert.equal(serverUtilsEdit.newText, "\"../shared/src/utils\"");
  assert.equal(serverTypesEdit.newText, "\"../shared/src/types\"");

  // Verify positions using indexOf on the server config file text
  const serverConfigText = serverConfigProblem.tsconfig.file.getFullText();
  const serverUtilsStringPos = serverConfigText.indexOf("\"packages/shared/src/utils\"");
  const serverTypesStringPos = serverConfigText.indexOf("\"packages/shared/src/types\"");

  assert(serverUtilsStringPos !== -1, "Should find utils string in server config");
  assert(serverTypesStringPos !== -1, "Should find types string in server config");

  // Text edits should target the exact positions of these strings
  assert.equal(serverUtilsEdit.start, serverUtilsStringPos, "Server utils edit should start at correct position");
  assert.equal(
    serverUtilsEdit.end,
    serverUtilsStringPos + "\"packages/shared/src/utils\"".length,
    "Server utils edit should end at correct position",
  );
  assert.equal(serverTypesEdit.start, serverTypesStringPos, "Server types edit should start at correct position");
  assert.equal(
    serverTypesEdit.end,
    serverTypesStringPos + "\"packages/shared/src/types\"".length,
    "Server types edit should end at correct position",
  );
});

test("fixNonRelativePathsProblem - sample project fixture", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "sample-project", "tsconfig.json");
  const configStore = new ConfigStore();
  configStore.loadProjects(tsconfigPath);
  const problems = getNonRelativePathsProblems(configStore.getConfigs().containsPaths, configStore);

  // Should find 1 problem in the sample project
  assert.equal(problems.length, 1);

  const problem = problems[0];
  assert(problem.tsconfig.fileName.endsWith("sample-project/tsconfig.json"));

  const edits = getNonRelativePathsFixes(problem);

  // Should have edits for all non-relative paths in the sample project
  assert(edits.length > 0, "Should have at least one edit");

  // Check that problematic paths are converted to relative paths
  const componentsEdit = edits.find(edit => edit.newText.includes("components"))!;
  const utilsEdit = edits.find(edit => edit.newText.includes("utils"))!;

  // "components/*" should become "./components/*" or similar relative path
  assert(componentsEdit.newText.startsWith("\"./") || componentsEdit.newText.startsWith("\"../"));

  // "utils/*" should become "./utils/*" or similar relative path
  assert(utilsEdit.newText.startsWith("\"./") || utilsEdit.newText.startsWith("\"../"));

  // Verify positions using indexOf on the sample project file text
  const sampleConfigText = problem.tsconfig.file.getFullText();

  // We know the sample project has paths like: "components/*": ["components/*"]
  // The edits target the array values (second occurrence), not the keys (first occurrence)
  const componentsValuePos = sampleConfigText.lastIndexOf("\"components/*\"");
  const utilsValuePos = sampleConfigText.lastIndexOf("\"utils/*\"");

  assert.equal(componentsEdit.start, componentsValuePos, "Components edit should target the array value position");
  assert.equal(
    componentsEdit.end,
    componentsValuePos + "\"components/*\"".length,
    "Components edit should end correctly",
  );

  assert.equal(utilsEdit.start, utilsValuePos, "Utils edit should target the array value position");
  assert.equal(utilsEdit.end, utilsValuePos + "\"utils/*\"".length, "Utils edit should end correctly");
});
