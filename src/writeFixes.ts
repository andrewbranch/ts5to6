import { readFileSync, writeFileSync } from "node:fs";
import type { TextEdit } from "./types.ts";
import { toSorted } from "typescript";

/**
 * Applies an array of text edits to their respective files on disk.
 * Edits for the same file are grouped together and applied in reverse order
 * to maintain correct positions when multiple edits occur in the same file.
 */
export function writeFixes(edits: readonly TextEdit[]): void {
  // Group edits by file name
  const editsByFile = new Map<string, TextEdit[]>();

  for (const edit of edits) {
    const fileEdits = editsByFile.get(edit.fileName) || [];
    fileEdits.push(edit);
    editsByFile.set(edit.fileName, fileEdits);
  }

  // Apply edits to each file
  for (const [fileName, fileEdits] of editsByFile) {
    applyEditsToFile(fileName, fileEdits);
  }
}

/**
 * Applies multiple text edits to a single file.
 * Edits are sorted in reverse order by start position to maintain
 * correct positions when applying multiple edits.
 */
function applyEditsToFile(fileName: string, edits: TextEdit[]): void {
  // Read the current file content
  const originalContent = readFileSync(fileName, "utf-8");

  // Sort edits in reverse order by start position
  // This ensures that later edits don't affect the positions of earlier edits
  const sortedEdits = (toSorted(edits, (a, b) => a.start - b.start) as any as TextEdit[]).reverse();

  // Validate that edits don't overlap
  for (let i = 0; i < sortedEdits.length - 1; i++) {
    const current = sortedEdits[i];
    const next = sortedEdits[i + 1];

    if (current.start < next.end) {
      throw new Error(
        `Overlapping edits detected in file ${fileName}: `
          + `edit at ${current.start}-${current.end} overlaps with edit at ${next.start}-${next.end}`,
      );
    }
  }

  // Apply edits from end to beginning
  let modifiedContent = originalContent;

  for (const edit of sortedEdits) {
    const before = modifiedContent.slice(0, edit.start);
    const after = modifiedContent.slice(edit.end);
    modifiedContent = before + edit.newText + after;
  }

  // Write the modified content back to disk
  writeFileSync(fileName, modifiedContent, "utf-8");
}
