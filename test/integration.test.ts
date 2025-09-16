import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fixBaseURLSync } from "../src/main.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
function createTestLogger() {
  const logs: string[] = [];
  return {
    logs,
    writeLn: (msg: string) => logs.push(msg),
  };
}

test("integration - extends-1 fixture", () => {
  const extendsPath = resolve(__dirname, "fixtures", "extends-1", "tsconfig.json");
  const logger = createTestLogger();
  assert.deepEqual(fixBaseURLSync(extendsPath, logger.writeLn), {
    [resolve(__dirname, "fixtures", "extends-1", "tsconfig.base.json")]: `{
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
    [resolve(__dirname, "fixtures", "extends-1", "tsconfig.other.json")]: `{
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
  const prPath = resolve(__dirname, "fixtures", "project-references", "tsconfig.json");
  const logger = createTestLogger();
  const prEdited = fixBaseURLSync(prPath, logger.writeLn);

  const basePath = resolve(__dirname, "fixtures", "project-references", "tsconfig.base.json");
  const serverPath = resolve(__dirname, "fixtures", "project-references", "packages", "server", "tsconfig.json");

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
    prEdited[resolve(__dirname, "fixtures", "project-references", "packages", "shared", "tsconfig.json")],
    expectedShared,
  );
  assert.equal(Object.keys(prEdited).length, 3, "Should only edit base and server tsconfigs");
});

test("integration - sample project fixture", () => {
  const samplePath = resolve(__dirname, "fixtures", "sample-project", "tsconfig.json");
  const logger = createTestLogger();
  const sampleEdited = fixBaseURLSync(samplePath, logger.writeLn);
  const expectedSample = `{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "moduleResolution": "node",
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
  assert.equal(sampleEdited[samplePath], expectedSample);
  assert.equal(Object.keys(sampleEdited).length, 1, "Should only edit the sample tsconfig");
});

test("integration - extends node_modules fixture", () => {
  const extendsPath = resolve(__dirname, "fixtures", "extends-node-mod", "tsconfig.json");
  const logger = createTestLogger();
  const extendsEdited = fixBaseURLSync(extendsPath, logger.writeLn);
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
  assert.equal(extendsEdited[extendsPath], expectedExtends);
});

test("integration - dot fixture", () => {
  const dotPath = resolve(__dirname, "fixtures", "dot", "tsconfig.json");
  const logger = createTestLogger();
  const dotEdited = fixBaseURLSync(dotPath, logger.writeLn);
  const expectedDot = `{
  "compilerOptions": {
    "paths": {
      "@@/*": ["./.tmp/*"]
    }
  }
}
`;
  assert.equal(dotEdited[dotPath], expectedDot);
  assert.equal(Object.keys(dotEdited).length, 1, "Should only edit the dot tsconfig");
});

test("integration - removeBaseUrl multiple baseUrl fixture 1", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "multiple-baseurl-1", "tsconfig.json");
  const logger = createTestLogger();
  const edited = fixBaseURLSync(tsconfigPath, logger.writeLn);
  assert.deepEqual(edited, {
    [resolve(__dirname, "fixtures", "multiple-baseurl-1", "tsconfig.json")]: `{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
  }
}
`,
    [resolve(__dirname, "fixtures", "multiple-baseurl-1", "tsconfig.base.json")]: `{
  "extends": "@tsconfig/docusaurus/tsconfig.json",
  "compilerOptions": {
    "baseUrl": null
  }
}
`,
  });
});

test("integration - removeBaseUrl multiple baseUrl fixture 2", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "multiple-baseurl-2", "tsconfig.json");
  const logger = createTestLogger();
  const edited = fixBaseURLSync(tsconfigPath, logger.writeLn);
  assert.deepEqual(edited, {
    [resolve(__dirname, "fixtures", "multiple-baseurl-2", "tsconfig.json")]: `{
  "extends": "./tsconfig.other.json",
  "compilerOptions": {
  }
}
`,
    [resolve(__dirname, "fixtures", "multiple-baseurl-2", "tsconfig.other.json")]: `{
  "extends": ["@tsconfig/docusaurus/tsconfig.json", "./tsconfig.base.json"],
  "compilerOptions": {
  }
}
`,
    [resolve(__dirname, "fixtures", "multiple-baseurl-2", "tsconfig.base.json")]: `{
  "extends": "@tsconfig/docusaurus/tsconfig.json",
  "compilerOptions": {
    "baseUrl": null
  }
}
`,
  });
});

test("integration - extends without options fixture", () => {
  const path = resolve(__dirname, "fixtures", "extends-without-options", "tsconfig.json");
  const logger = createTestLogger();
  const edited = fixBaseURLSync(path, logger.writeLn);
  const basePath = resolve(__dirname, "fixtures", "extends-without-options", "tsconfig.base.json");
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
