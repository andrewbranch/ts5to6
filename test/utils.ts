import { toSorted } from "typescript";
import type { ConfigStore } from "../src/configStore.ts";
import type { TextEdit } from "../src/types.ts";

export function applyEdits(input: string, edits: TextEdit[]): string {
  // Sort edits in reverse order by start position to maintain correct positions
  const sortedEdits = (toSorted(edits, (a, b) => a.start - b.start) as any as TextEdit[]).reverse();
  let result = input;
  for (const edit of sortedEdits) {
    result = result.slice(0, edit.start) + edit.newText + result.slice(edit.end);
  }

  return result;
}

export function applyEditsToConfigs(store: ConfigStore, edits: TextEdit[]): Record<string, string> {
  const editsByFile = new Map<string, TextEdit[]>();
  for (const edit of edits) {
    if (!editsByFile.has(edit.fileName)) {
      editsByFile.set(edit.fileName, []);
    }
    editsByFile.get(edit.fileName)!.push(edit);
  }

  const editedConfigs: Record<string, string> = {};
  for (const [fileName, fileEdits] of editsByFile) {
    editedConfigs[fileName] = editedConfigs[fileName] || store.getText(fileName) || "";
    const newText = applyEdits(editedConfigs[fileName], fileEdits);
    editedConfigs[fileName] = newText;
  }
  return editedConfigs;
}
