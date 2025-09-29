import assert from "node:assert/strict";
import { test } from "node:test";
import { getFixIssueSync, fixturePath } from "./integration.test.ts";

function fixBaseUrlSync(...subPath: string[]) {
  return getFixIssueSync("baseUrl", ...subPath);
}

test("integration - extends-1 fixture", () => {
  assert.deepEqual(fixBaseUrlSync("extends-1", "tsconfig.json").result, {
    [fixturePath("baseUrl", "extends-1", "tsconfig.base.json")]: `{
  "compilerOptions": {
    "paths": {
      "utils/*": ["./src/utils/*"],
      "components/*": ["./src/components/*"]
    },
    "target": "es2020",
    "module": "esnext"
  }
}
`,
    [fixturePath("baseUrl", "extends-1", "tsconfig.other.json")]: `{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "other-dist",
    "paths": {
      "models/*": ["./src/models/*"],
      "services/*": ["./src/services/*"],
      "shared/*": ["./src/shared/*"]
    }
  },
  "include": ["other-src/**/*"]
}
`,
  });
});

test("integration - project references fixture", () => {
  const prEdited = fixBaseUrlSync("project-references", "tsconfig.json").result;

  const basePath = fixturePath("baseUrl", "project-references", "tsconfig.base.json");
  const serverPath = fixturePath("baseUrl", "project-references", "packages", "server", "tsconfig.json");

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
    "paths": {
      "@shared/utils": ["./packages/shared/src/utils"],
      "@shared/types": ["./packages/shared/src/types"],
      "*": ["./*"]
    }
  }
}
`;

  const expectedServer = `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@shared/utils": ["../shared/src/utils"],
      "@shared/types": ["../shared/src/types"],
      "*": ["../../*"]
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

  const expectedShared = `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@shared/utils": ["./src/packages/shared/src/utils"],
      "@shared/types": ["./src/packages/shared/src/types"]
    }
  },
  "include": ["src/**/*"]
}
`;

  assert.equal(prEdited[basePath], expectedBase);
  assert.equal(prEdited[serverPath], expectedServer);
  assert.equal(
    prEdited[fixturePath("baseUrl", "project-references", "packages", "shared", "tsconfig.json")],
    expectedShared,
  );
  assert.equal(Object.keys(prEdited).length, 3, "Should only edit base and server tsconfigs");
});

test("integration - sample project fixture", () => {
  const { path, result } = fixBaseUrlSync("sample-project", "tsconfig.json");
  const expectedSample = `{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "moduleResolution": "node",
    "paths": {
      "components/*": ["./src/components/*"],
      "types": ["./src/types/index"],
      "*": ["./src/*"]
    },
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
`;
  assert.equal(result[path], expectedSample);
  assert.equal(Object.keys(result).length, 1, "Should only edit the sample tsconfig");
});

test("integration - extends node_modules fixture", () => {
  const { path, result } = fixBaseUrlSync("extends-node-mod", "tsconfig.json");
  const expectedExtends = `{
  "extends": "@tsconfig/docusaurus/tsconfig.json",
  "compilerOptions": {
    "baseUrl": null,
    "outDir": "./dist",
    "paths": {
      "@pkg/*": ["./packages/pkg/*"],
      "shared/*": ["./shared/*"]
    }
  },
  "include": ["src/**/*"]
}
`;
  assert.equal(result[path], expectedExtends);
});

test("integration - dot fixture", () => {
  const { path, result } = fixBaseUrlSync("dot", "tsconfig.json");
  const expectedDot = `{
  "compilerOptions": {
    "paths": {
      "@@/*": ["./.tmp/*"]
    }
  }
}
`;
  assert.equal(result[path], expectedDot);
  assert.equal(Object.keys(result).length, 1, "Should only edit the dot tsconfig");
});

test("integration - removeBaseUrl multiple baseUrl fixture 1", () => {
  const edited = fixBaseUrlSync("multiple-baseurl-1", "tsconfig.json").result;
  assert.deepEqual(edited, {
    [fixturePath("baseUrl", "multiple-baseurl-1", "tsconfig.json")]: `{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
  }
}
`,
    [fixturePath("baseUrl", "multiple-baseurl-1", "tsconfig.base.json")]: `{
  "extends": "@tsconfig/docusaurus/tsconfig.json",
  "compilerOptions": {
    "baseUrl": null
  }
}
`,
  });
});

test("integration - removeBaseUrl multiple baseUrl fixture 2", () => {
  const edited = fixBaseUrlSync("multiple-baseurl-2", "tsconfig.json").result;
  assert.deepEqual(edited, {
    [fixturePath("baseUrl", "multiple-baseurl-2", "tsconfig.json")]: `{
  "extends": "./tsconfig.other.json",
  "compilerOptions": {
  }
}
`,
    [fixturePath("baseUrl", "multiple-baseurl-2", "tsconfig.other.json")]: `{
  "extends": ["@tsconfig/docusaurus/tsconfig.json", "./tsconfig.base.json"],
  "compilerOptions": {
  }
}
`,
    [fixturePath("baseUrl", "multiple-baseurl-2", "tsconfig.base.json")]: `{
  "extends": "@tsconfig/docusaurus/tsconfig.json",
  "compilerOptions": {
    "baseUrl": null
  }
}
`,
  });
});

test("integration - extends without options fixture", () => {
  const edited = fixBaseUrlSync("extends-without-options", "tsconfig.json").result;
  const basePath = fixturePath("baseUrl", "extends-without-options", "tsconfig.base.json");
  const expectedBase = `{
  "compilerOptions": {
    "paths": {
      "utils/*": ["./src/utils/*"],
      "components/*": ["./src/components/*"]
    },
    "target": "es2020",
    "module": "esnext"
  }
}
`;
  assert.equal(edited[basePath], expectedBase);
  assert.equal(Object.keys(edited).length, 1, "Should only edit the base tsconfig");
});
