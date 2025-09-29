import assert from "node:assert/strict";
import { test } from "node:test";
import { getFixIssueSync, fixturePath } from "./integration.test.ts";

function fixRootDirSync(...fixture: string[]) {
 return getFixIssueSync("rootDir", ...fixture)
}

test("integration - extends-without-options", () => {
  const { path, result } = fixRootDirSync("extends-without-options", "tsconfig.json");
  assert.deepEqual(result, {
    [path]: `{
  "extends": "./tsconfig.base",
  "include": ["src/**/*"],
  "compilerOptions": {
    "rootDir": "./src"
  }
}
`,
  });
});

test("integration - project references fixture", () => {
  assert.deepEqual(fixRootDirSync("project-references", "tsconfig.json").result, {
    [fixturePath("rootDir", "project-references", "packages", "server", "tsconfig.json")]: `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    {
      "path": "../shared"
    }
  ]
}
`,
  });
});

test("integration - multiple extends 1 - adds to the config", () => {
  const { path, result } = fixRootDirSync("multiple-extends-1", "tsconfig.json");
  assert.deepEqual(result, {
    [path]: `{
  "extends": "./tsconfig.base.json",
  "include": ["src/**/*"],
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "./src"
  }
}
`,
  });
});

test("integration - multiple extends 2 - removes rootDir", () => {
  const { path, result } = fixRootDirSync("multiple-extends-2", "tsconfig.json");
  assert.deepEqual(result, {
    [path]: `{
  "extends": "./tsconfig.other.json",
  "include": ["src/**/*"],
  "compilerOptions": {
  }
}
`,
  });
});

test("integration - multiple extends 3 - updates rootDir when first config results in mismatch with expected result", () => {
  const { path, result } = fixRootDirSync("multiple-extends-3", "tsconfig.json");
  assert.deepEqual(result, {
    [path]: `{
  "extends": "./tsconfig.other.json",
  "include": ["src/**/*"],
  "compilerOptions": {
    "rootDir": "./src"
  }
}
`,
  });
});

test("integration - multiple extends 4 - handles when last extended config doesnt have rootDir", () => {
  const { path, result } = fixRootDirSync("multiple-extends-4", "tsconfig.json");
  assert.deepEqual(result, {
    [path]: `{
  "extends": "./tsconfig.other.json",
  "include": ["src/**/*"],
  "compilerOptions": {
  }
}
`,
  });
});

// add new rootDir instead of changing in base - "node_modules extends"
// ../.. change base when its relative to extends but not config
// Change config if extends is used by config of project without problem
