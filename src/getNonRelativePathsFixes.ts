import { dirname, relative, resolve } from "node:path";
import { normalizeSlashes } from "#typescript";
import type { NonRelativePathsProblem, TextEdit } from "./types.ts";

export function getNonRelativePathsFixes(problem: NonRelativePathsProblem): TextEdit[] {
  const { tsconfig, problematicPaths, effectiveBaseUrl } = problem;
  const edits: TextEdit[] = [];
  const tsconfigDir = dirname(tsconfig.fileName);

  for (const pathStringLiteral of problematicPaths) {
    const currentPath = pathStringLiteral.text;

    // Resolve the absolute path that the non-relative path currently points to
    const baseUrl = resolve(dirname(effectiveBaseUrl.definedIn.fileName), effectiveBaseUrl.value.text);
    const absoluteTargetPath = resolve(baseUrl, currentPath);

    // Make it relative to the tsconfig directory
    const relativePath = relative(tsconfigDir, absoluteTargetPath);

    // Ensure it starts with ./ if it's not already relative
    const normalizedRelativePath = normalizeSlashes(
      relativePath.startsWith("./") || relativePath.startsWith("../") ? relativePath : `./${relativePath}`,
    );

    edits.push({
      fileName: tsconfig.fileName,
      newText: `"${normalizedRelativePath}"`,
      start: pathStringLiteral.getStart(tsconfig.file),
      end: pathStringLiteral.getEnd(),
    });
  }

  return edits;
}
