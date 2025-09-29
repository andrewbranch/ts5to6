import { normalizeSlashes } from "#typescript";
import { dirname, relative, resolve } from "node:path";
import type { PathsProblem, TextEdit } from "./types.ts";

export function getPathsFixes(problem: PathsProblem): TextEdit[] {
  if (problem.tsconfig.fileName.includes("/node_modules/")) {
    return [];
  }
  const { tsconfig, problematicPaths, effectiveBaseUrl } = problem;
  const edits: TextEdit[] = [];
  const tsconfigDir = dirname(tsconfig.fileName);

  for (const pathStringLiteral of problematicPaths) {
    const currentPath = pathStringLiteral.text;

    // Resolve the absolute path that the non-relative path currently points to
    const baseUrl = resolve(dirname(effectiveBaseUrl.definedIn.fileName), effectiveBaseUrl.value.text);
    const absoluteTargetPath = resolve(baseUrl, currentPath);

    // Make it relative to the tsconfig directory
    const relativePath = normalizeSlashes(relative(tsconfigDir, absoluteTargetPath));

    // Ensure it starts with ./ if it's not already relative
    const normalizedRelativePath = relativePath.startsWith("./") || relativePath.startsWith("../")
      ? relativePath
      : `./${relativePath}`;

    edits.push({
      fileName: tsconfig.fileName,
      newText: `"${normalizedRelativePath}"`,
      start: pathStringLiteral.getStart(tsconfig.file),
      end: pathStringLiteral.getEnd(),
      description: problem.kind === "NonRelative"
        ? "converted path mapping to relative"
        : "rebased path mapping against tsconfig directory",
    });
  }

  return edits;
}
