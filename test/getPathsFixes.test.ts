import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "../src/configStore.ts";
import { getPathsFixes } from "../src/getPathsFixes.ts";
import { getPathsProblems } from "../src/getPathsProblems.ts";
import { applyEdits, applyEditsToConfigs } from "./utils.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("getNonRelativePathsFixes - project references fixture", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "project-references", "tsconfig.json");
  const configStore = new ConfigStore();
  configStore.loadProjects(tsconfigPath);
  const problems = getPathsProblems(configStore.getConfigs().containsPaths, configStore);

  // Apply all fixes and assert the two affected files match expected contents
  const fixes = problems.flatMap(getPathsFixes);
  const applied = applyEditsToConfigs(configStore, fixes);

  const basePath = resolve(__dirname, "fixtures", "project-references", "tsconfig.base.json");
  const baseUpdated = applied[basePath] || configStore.getText(basePath) || "";
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
      "@shared/utils": ["./packages/shared/src/utils"],
      "@shared/types": ["./packages/shared/src/types"]
    }
  }
}
`;
  assert.equal(baseUpdated, expectedBase, "Base config should have non-relative paths converted to relative values");

  const serverPath = resolve(__dirname, "fixtures", "project-references", "packages", "server", "tsconfig.json");
  const serverUpdated = applied[serverPath] || configStore.getText(serverPath) || "";
  const expectedServer = `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@shared/utils": ["../shared/src/utils"],
      "@shared/types": ["../shared/src/types"]
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
  assert.equal(
    serverUpdated,
    expectedServer,
    "Server config should have non-relative paths converted to relative values",
  );
});

test("fixNonRelativePathsProblem - sample project fixture", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "sample-project", "tsconfig.json");
  const configStore = new ConfigStore();
  configStore.loadProjects(tsconfigPath);
  const problems = getPathsProblems(configStore.getConfigs().containsPaths, configStore);

  // Should find 1 problem in the sample project
  assert.equal(problems.length, 1);

  const fixes = problems.flatMap(getPathsFixes);
  const applied = applyEditsToConfigs(configStore, fixes);

  const samplePath = resolve(__dirname, "fixtures", "sample-project", "tsconfig.json");
  const sampleUpdated = applied[samplePath] || configStore.getText(samplePath) || "";
  const expectedSample = `{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "moduleResolution": "node",
    "baseUrl": "src",
    "paths": {
      "components/*": ["./src/components/*"],
      "utils/*": ["./src/utils/*"],
      "types": ["./src/types/index"]
    },
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
`;
  assert.equal(
    sampleUpdated,
    expectedSample,
    "Sample project config should have non-relative mappings converted to relative values",
  );
});

test("getNonRelativePathsFixes - dot", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "dot", "tsconfig.json");
  const configStore = new ConfigStore();
  configStore.loadProjects(tsconfigPath);
  const problems = getPathsProblems(configStore.getConfigs().containsPaths, configStore);
  const fixes = problems.flatMap(getPathsFixes);
  const fixed = applyEdits(configStore.getProjectConfig(tsconfigPath)!.file.text, fixes);
  assert.equal(
    fixed,
    `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@@/*": ["./.tmp/*"]
    }
  }
}
`,
  );
});
