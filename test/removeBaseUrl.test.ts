import { parseConfigFileTextToJson, readJsonConfigFile } from "#typescript";
import assert from "node:assert/strict";
import { dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { getRemoveBaseUrlEdits } from "../src/removeBaseUrl.ts";
import type { TSConfig } from "../src/types.ts";
import { applyEdits } from "./utils.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function createTSConfig(fileName: string, content: string): TSConfig {
  const file = readJsonConfigFile(fileName, () => content);
  const raw = parseConfigFileTextToJson(fileName, content).config;
  return {
    fileName,
    raw,
    file,
  } as TSConfig;
}

test("getRemoveBaseUrlEdits - removes baseUrl from middle of object", () => {
  const input = `{
  "compilerOptions": {
    "target": "es2020",
    "baseUrl": "./",
    "paths": {
      "utils/*": ["./utils/*"]
    }
  }
}`;

  const expected = `{
  "compilerOptions": {
    "target": "es2020",
    "paths": {
      "utils/*": ["./utils/*"]
    }
  }
}`;

  const tsconfig = createTSConfig("tsconfig.json", input);
  const edits = getRemoveBaseUrlEdits([tsconfig]);

  assert.equal(edits.length, 1);

  const result = applyEdits(input, edits);
  assert.equal(result, expected);
});

test("getRemoveBaseUrlEdits - removes baseUrl from beginning of object", () => {
  const input = `{
  "compilerOptions": {
    "baseUrl": "./",
    "target": "es2020",
    "paths": {
      "utils/*": ["./utils/*"]
    }
  }
}`;

  const expected = `{
  "compilerOptions": {
    "target": "es2020",
    "paths": {
      "utils/*": ["./utils/*"]
    }
  }
}`;

  const tsconfig = createTSConfig("tsconfig.json", input);
  const edits = getRemoveBaseUrlEdits([tsconfig]);

  assert.equal(edits.length, 1);

  const result = applyEdits(input, edits);
  assert.equal(result, expected);
});

test("getRemoveBaseUrlEdits - no trailing comma", () => {
  const input = `{
  "compilerOptions": {
    "target": "es2020",
    "paths": {
      "utils/*": ["./utils/*"]
    },
    "baseUrl": "./"
  }
}`;

  const expected = `{
  "compilerOptions": {
    "target": "es2020",
    "paths": {
      "utils/*": ["./utils/*"]
    }
  }
}`;

  const tsconfig = createTSConfig("tsconfig.json", input);
  const edits = getRemoveBaseUrlEdits([tsconfig]);

  const result = applyEdits(input, edits);
  assert.equal(result, expected);
});

test("getRemoveBaseUrlEdits - trailing comma", () => {
  const input = `{
  "compilerOptions": {
    "target": "es2020",
    "paths": {
      "utils/*": ["./utils/*"]
    },
    "baseUrl": "./",
  }
}`;

  const expected = `{
  "compilerOptions": {
    "target": "es2020",
    "paths": {
      "utils/*": ["./utils/*"]
    },
  }
}`;

  const tsconfig = createTSConfig("tsconfig.json", input);
  const edits = getRemoveBaseUrlEdits([tsconfig]);

  assert.equal(edits.length, 1);

  const result = applyEdits(input, edits);
  assert.equal(result, expected);
});

test("getRemoveBaseUrlEdits - deletes leading comments and trailing line comments", () => {
  const input = `{
  "compilerOptions": {
    // This is the base URL
    "baseUrl": "./", // base URL comment
    // Another comment
    "target": "es2020",
  }
}`;

  const expected = `{
  "compilerOptions": {
    // Another comment
    "target": "es2020",
  }
}`;

  const tsconfig = createTSConfig("tsconfig.json", input);
  const edits = getRemoveBaseUrlEdits([tsconfig]);

  assert.equal(edits.length, 1);
  const result = applyEdits(input, edits);
  assert.equal(result, expected);
});

test("getRemoveBaseUrlEdits - handles multiple tsconfigs", () => {
  const input1 = `{
  "compilerOptions": {
    "baseUrl": "./",
    "target": "es2020"
  }
}`;

  const input2 = `{
  "compilerOptions": {
    "target": "es2020",
    "baseUrl": "./src"
  }
}`;

  const tsconfig1 = createTSConfig("tsconfig1.json", input1);
  const tsconfig2 = createTSConfig("tsconfig2.json", input2);
  const edits = getRemoveBaseUrlEdits([tsconfig1, tsconfig2]);

  // Check that each file gets an edit
  const edit1 = edits.find(e => e.fileName === "tsconfig1.json")!;
  const edit2 = edits.find(e => e.fileName === "tsconfig2.json")!;

  assert(edit1);
  assert(edit2);
});

test("getRemoveBaseUrlEdits - skips tsconfigs without baseUrl", () => {
  const input = `{
  "compilerOptions": {
    "target": "es2020",
    "paths": {
      "utils/*": ["./utils/*"]
    }
  }
}`;

  const tsconfig = createTSConfig("tsconfig.json", input);
  const edits = getRemoveBaseUrlEdits([tsconfig]);

  // Should not generate any edits since there's no baseUrl
  assert.equal(edits.length, 0);
});

test("getRemoveBaseUrlEdits - trailing comma detection issue", () => {
  // This test demonstrates a case where trailing comma detection might not work correctly
  const input = `{
  "compilerOptions": {
    "baseUrl": "./",
    "target": "es2020",
    "strict": true,
  }
}`;

  const expected = `{
  "compilerOptions": {
    "target": "es2020",
    "strict": true,
  }
}`;

  const tsconfig = createTSConfig("tsconfig.json", input);
  const edits = getRemoveBaseUrlEdits([tsconfig]);

  assert.equal(edits.length, 1);

  const result = applyEdits(input, edits);
  assert.equal(result, expected);
});

// Fixture-based tests moved to integration.test.ts
