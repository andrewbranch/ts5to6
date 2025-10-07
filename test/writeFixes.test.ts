import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TextEdit } from "../src/types.ts";
import { writeFixes } from "../src/writeFixes.ts";

test("writeFixes - applies single edit to file", () => {
  // Create a temporary directory and file
  const tempDir = mkdtempSync(join(tmpdir(), "ts5to6-test-"));
  const testFile = join(tempDir, "test.json");

  try {
    // Create test file with content
    const originalContent = `{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "utils/*": ["utils/*"]
    }
  }
}`;
    writeFileSync(testFile, originalContent, "utf-8");

    // Create text edit to fix the path
    const edits: TextEdit[] = [
      {
        fileName: testFile,
        newText: "\"./utils/*\"",
        start: originalContent.indexOf("\"utils/*\""),
        end: originalContent.indexOf("\"utils/*\"") + "\"utils/*\"".length,
      },
    ];

    // Apply the edits
    writeFixes(edits);

    // Verify the file was modified correctly
    const modifiedContent = readFileSync(testFile, "utf-8");
    const expectedContent = originalContent.replace("\"utils/*\"", "\"./utils/*\"");

    assert.equal(modifiedContent, expectedContent);
  } finally {
    // Clean up
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("writeFixes - applies multiple edits to same file", () => {
  // Create a temporary directory and file
  const tempDir = mkdtempSync(join(tmpdir(), "ts5to6-test-"));
  const testFile = join(tempDir, "tsconfig.json");

  try {
    // Create test file with multiple paths
    const originalContent = `{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "components/*": ["components/*"],
      "utils/*": ["utils/*"]
    }
  }
}`;
    writeFileSync(testFile, originalContent, "utf-8");

    // Create multiple text edits
    const componentsPos = originalContent.lastIndexOf("\"components/*\"");
    const utilsPos = originalContent.lastIndexOf("\"utils/*\"");

    const edits: TextEdit[] = [
      {
        fileName: testFile,
        newText: "\"./components/*\"",
        start: componentsPos,
        end: componentsPos + "\"components/*\"".length,
      },
      {
        fileName: testFile,
        newText: "\"./utils/*\"",
        start: utilsPos,
        end: utilsPos + "\"utils/*\"".length,
      },
    ];

    // Apply the edits
    writeFixes(edits);

    // Verify the file was modified correctly
    const modifiedContent = readFileSync(testFile, "utf-8");

    // Both path values should be updated
    assert(modifiedContent.includes("\"./components/*\""));
    assert(modifiedContent.includes("\"./utils/*\""));

    // The path keys should remain unchanged
    assert(modifiedContent.includes("\"components/*\": [\"./components/*\"]"));
    assert(modifiedContent.includes("\"utils/*\": [\"./utils/*\"]"));
  } finally {
    // Clean up
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("writeFixes - applies edits to multiple files", () => {
  // Create a temporary directory and files
  const tempDir = mkdtempSync(join(tmpdir(), "ts5to6-test-"));
  const file1 = join(tempDir, "tsconfig1.json");
  const file2 = join(tempDir, "tsconfig2.json");

  try {
    // Create test files
    const content1 = `{"paths": {"utils/*": ["utils/*"]}}`;
    const content2 = `{"paths": {"components/*": ["components/*"]}}`;

    writeFileSync(file1, content1, "utf-8");
    writeFileSync(file2, content2, "utf-8");

    // Create edits for both files
    const edits: TextEdit[] = [
      {
        fileName: file1,
        newText: "\"./utils/*\"",
        start: content1.lastIndexOf("\"utils/*\""),
        end: content1.lastIndexOf("\"utils/*\"") + "\"utils/*\"".length,
      },
      {
        fileName: file2,
        newText: "\"./components/*\"",
        start: content2.lastIndexOf("\"components/*\""),
        end: content2.lastIndexOf("\"components/*\"") + "\"components/*\"".length,
      },
    ];

    // Apply the edits
    writeFixes(edits);

    // Verify both files were modified correctly
    const modified1 = readFileSync(file1, "utf-8");
    const modified2 = readFileSync(file2, "utf-8");

    assert(modified1.includes("\"./utils/*\""));
    assert(modified2.includes("\"./components/*\""));
  } finally {
    // Clean up
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("writeFixes - throws error on overlapping edits", () => {
  // Create a temporary directory and file
  const tempDir = mkdtempSync(join(tmpdir(), "ts5to6-test-"));
  const testFile = join(tempDir, "test.json");

  try {
    // Create test file
    const content = `{"test": "value"}`;
    writeFileSync(testFile, content, "utf-8");

    // Create overlapping edits (both trying to edit the same range)
    const edits: TextEdit[] = [
      {
        fileName: testFile,
        newText: "\"new1\"",
        start: 10,
        end: 17, // overlaps with next edit
      },
      {
        fileName: testFile,
        newText: "\"new2\"",
        start: 15, // overlaps with previous edit
        end: 20,
      },
    ];

    // Should throw an error due to overlapping edits
    assert.throws(() => {
      writeFixes(edits);
    }, /Overlapping edits detected/);
  } finally {
    // Clean up
    rmSync(tempDir, { recursive: true, force: true });
  }
});
