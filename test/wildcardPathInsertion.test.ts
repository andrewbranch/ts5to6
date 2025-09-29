import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "../src/configStore.ts";
import { getAddWildcardPathsEdits } from "../src/getResolutionUsesBaseUrlFixes.ts";
import { applyEdits } from "./utils.ts";

const __dirname = fileURLToPath(new URL("./", import.meta.url));

function loadProject(tsconfigPath: string) {
  const store = new ConfigStore();
  const content = fs.readFileSync(tsconfigPath, "utf8");
  const source = store.parseTsconfigIntoSourceFile(tsconfigPath, content);
  const project = store.parseTsconfigSourceFileIntoProject(source, "affected");
  return { project, content, store };
}

test("getAddWildcardPathsEdits - paths without trailing comma", () => {
  const path = resolve(__dirname, "fixtures", "baseUrl", "paths-insertion", "paths-no-trailing-comma", "tsconfig.json");
  const { project, content, store } = loadProject(path);
  const edits = getAddWildcardPathsEdits(project, store);
  assert(edits && edits.length > 0, "Should produce edits");
  const updated = applyEdits(content, edits || []);
  const expected = `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "foo": ["bar"],
      "*": ["./*"]
    }
  }
}
`;
  assert.equal(updated, expected);
});

test("getAddWildcardPathsEdits - paths with trailing comma", () => {
  const path = resolve(
    __dirname,
    "fixtures",
    "baseUrl",
    "paths-insertion",
    "paths-with-trailing-comma",
    "tsconfig.json",
  );
  const { project, content, store } = loadProject(path);
  const edits = getAddWildcardPathsEdits(project, store);
  assert(edits && edits.length > 0, "Should produce edits");
  const updated = applyEdits(content, edits || []).replaceAll("\r\n", "\n");
  const expected = `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "foo": ["bar"],
      "*": ["./*"],
    }
  }
}
`.replaceAll("\r\n", "\n");
  assert.equal(updated, expected);
});

test("getAddWildcardPathsEdits - empty paths object", () => {
  const path = resolve(__dirname, "fixtures", "baseUrl", "paths-insertion", "paths-empty", "tsconfig.json");
  const { project, content, store } = loadProject(path);
  const edits = getAddWildcardPathsEdits(project, store);
  assert(edits && edits.length > 0, "Should produce edits");
  const updated = applyEdits(content, edits || []);
  const expected = `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "*": ["./*"] }
  }
}
`;
  assert.equal(updated, expected);
});

test("getAddWildcardPathsEdits - no compilerOptions", () => {
  const path = resolve(__dirname, "fixtures", "baseUrl", "paths-insertion", "no-compiler-options", "tsconfig.json");
  const { project, content, store } = loadProject(path);
  const edits = getAddWildcardPathsEdits(project, store);
  assert(edits && edits.length > 0, "Should produce edits");
  const updated = applyEdits(content, edits || []);
  const expected = `{
  "extends": "./base.json",
  "compilerOptions": { "paths": { "*": ["./*"] } }
}
`;
  assert.equal(updated, expected);
});

test("getAddWildcardPathsEdits - trailing comment on last property", () => {
  const path = resolve(__dirname, "fixtures", "baseUrl", "paths-insertion", "paths-with-comments", "tsconfig.json");
  const { project, content, store } = loadProject(path);
  const edits = getAddWildcardPathsEdits(project, store);
  assert(edits && edits.length > 0, "Should produce edits");
  const updated = applyEdits(content, edits || []);
  const expected = `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "foo": ["bar"], // trailing comment
      "*": ["./*"]
    }
  }
}
`;
  assert.equal(updated, expected);
});
