import { toSorted } from "#typescript";
import { readFileSync, writeFileSync } from "node:fs";
import type { TextEdit } from "./types.ts";

/**
 * Apply a set of TextEdits against the provided store (which can supply
 * existing file text via getText). Returns a map of fileName -> modifiedContent.
 * This function validates that edits for a single file do not overlap and
 * applies them in reverse order so positions remain valid.
 */
export function applyEditsToConfigs(
  store: { getText(fileName: string): string | undefined },
  edits: readonly TextEdit[],
): Record<string, string> {
  const editsByFile = new Map<string, TextEdit[]>();

  for (const edit of edits) {
    const fileEdits = editsByFile.get(edit.fileName) || [];
    fileEdits.push(edit);
    editsByFile.set(edit.fileName, fileEdits);
  }

  const editedConfigs: Record<string, string> = {};
  for (const [fileName, fileEdits] of editsByFile) {
    // Get the original content (from store, or read from disk as a fallback)
    let original = store.getText(fileName);
    if (original === undefined) {
      original = readFileSync(fileName, "utf8");
    }

    // Sort edits in ascending order by start position for validation
    const sortedAsc = toSorted(fileEdits, (a, b) => a.start - b.start) as any as TextEdit[];
    // Validate that edits don't overlap
    for (let i = 0; i < sortedAsc.length - 1; i++) {
      const current = sortedAsc[i];
      const next = sortedAsc[i + 1];
      if (current.end > next.start) {
        throw new Error(
          `Overlapping edits detected in file ${fileName}: `
            + `edit at ${current.start}-${current.end} overlaps with edit at ${next.start}-${next.end}`,
        );
      }
    }

    // Apply edits in reverse order by start position
    const sortedEdits = sortedAsc.slice().reverse();
    let modifiedContent = original;
    for (const edit of sortedEdits) {
      modifiedContent = modifiedContent.slice(0, edit.start) + edit.newText + modifiedContent.slice(edit.end);
    }

    editedConfigs[fileName] = modifiedContent;
  }

  return editedConfigs;
}

/**
 * Applies an array of text edits to their respective files on disk.
 * Edits for the same file are grouped together and applied in reverse order
 * to maintain correct positions when multiple edits occur in the same file.
 */
export function writeFixes(edits: readonly TextEdit[]): void {
  const edited = applyEditsToConfigs({ getText: (f: string) => readFileSync(f, "utf8") }, edits);
  for (const [fileName, content] of Object.entries(edited)) {
    writeFileSync(fileName, content, "utf8");
  }
}
