import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfigFileTextToJson, readJsonConfigFile } from "typescript";
import { getRemoveBaseUrlEdits } from "../src/removeBaseUrl.ts";
import type { TextEdit, TSConfig } from "../src/types.ts";

function createTSConfig(fileName: string, content: string): TSConfig {
  const file = readJsonConfigFile(fileName, () => content);
  const raw = parseConfigFileTextToJson(fileName, content).config;
  return {
    fileName,
    raw,
    file,
  };
}

function applyEdits(input: string, edits: TextEdit[]): string {
  // Sort edits in reverse order by start position to maintain correct positions
  const sortedEdits = [...edits].sort((a, b) => b.start - a.start);

  let result = input;
  for (const edit of sortedEdits) {
    result = result.slice(0, edit.start) + edit.newText + result.slice(edit.end);
  }

  return result;
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
