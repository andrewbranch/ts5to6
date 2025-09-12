import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "../src/configStore.ts";
import {
  selectTsconfigForAddingPaths,
  getAddWildcardPathsEdits,
} from "../src/getResolutionUsesBaseUrlFixes.ts";
import { applyEditsToConfigs } from "./utils.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("selectTsconfigForAddingPaths - project-references fixture", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "project-references", "tsconfig.json");
  const store = new ConfigStore();
  store.loadProjects(tsconfigPath);

  const configs = store.getConfigs();
  // Find projects by filename
  const client = configs.affectedProjects.find(p => p.fileName.includes("packages/client"));
  const server = configs.affectedProjects.find(p => p.fileName.includes("packages/server"));
  const shared = configs.affectedProjects.find(p => p.fileName.includes("packages/shared"));

  assert(client, "Client project should exist");
  assert(server, "Server project should exist");
  assert(shared, "Shared project should exist");

  const clientTarget = selectTsconfigForAddingPaths(client!, store);
  const serverTarget = selectTsconfigForAddingPaths(server!, store);
  const sharedTarget = selectTsconfigForAddingPaths(shared!, store);

  // Client should target the base tsconfig (nearest that defines paths)
  assert(clientTarget.fileName.endsWith("tsconfig.base.json"));

  // Server defines paths itself, so it should target its own tsconfig
  assert(serverTarget.fileName.includes("packages/server/tsconfig.json"));

  // Shared extends the base which defines paths, so it should target the base tsconfig
  assert(sharedTarget.fileName.endsWith("tsconfig.base.json"));
});

test("getAddWildcardPathsEdits - project-references fixture", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "project-references", "tsconfig.json");
  const store = new ConfigStore();
  store.loadProjects(tsconfigPath);

  const configs = store.getConfigs();
  const client = configs.affectedProjects.find(p => p.fileName.includes("packages/client"));
  const server = configs.affectedProjects.find(p => p.fileName.includes("packages/server"));

  assert(client && server, "Client and server projects should exist");

  const clientTarget = selectTsconfigForAddingPaths(client!, store);
  const serverTarget = selectTsconfigForAddingPaths(server!, store);

  const clientEdits = getAddWildcardPathsEdits(clientTarget);
  const serverEdits = getAddWildcardPathsEdits(serverTarget);

  // Both should produce edits (base has paths, server defines paths)
  assert(clientEdits && clientEdits.length > 0, "Client target should produce edits to add wildcard paths");
  assert(serverEdits && serverEdits.length > 0, "Server target should produce edits to add wildcard paths");

  // Apply the edits and verify the resulting files include the new mapping
  const applied = applyEditsToConfigs(store, [...(clientEdits ?? []), ...(serverEdits ?? [])]);

  // Check base config now contains the wildcard mapping
  const basePath = resolve(__dirname, "fixtures", "project-references", "tsconfig.base.json");
  const baseUpdated = applied[basePath] || store.getText(basePath) || "";
  const expectedBase = `{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@shared/utils": ["packages/shared/src/utils"],
      "@shared/types": ["packages/shared/src/types"],
      "*": ["./*"]
    }
  }
}
`;
  assert.equal(baseUpdated, expectedBase, "Base config should match expected formatting with wildcard mapping");

  // Check server config now contains the wildcard mapping
  const serverPath = resolve(__dirname, "fixtures", "project-references", "packages", "server", "tsconfig.json");
  const serverUpdated = applied[serverPath] || store.getText(serverPath) || "";
  const expectedServer = `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@shared/utils": ["packages/shared/src/utils"],
      "@shared/types": ["packages/shared/src/types"],
      "*": ["./*"]
    }
  },
  "include": ["src/**/*"],
  "references": [
    {
      "path": "../shared"
    }
  ]
}
`;
  assert.equal(serverUpdated, expectedServer, "Server config should match expected formatting with wildcard mapping");
});
