import { toSorted } from "#typescript";
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

export { applyEditsToConfigs } from "../src/writeFixes.ts";
