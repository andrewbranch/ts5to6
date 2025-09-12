import {
  type ArrayLiteralExpression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type StringLiteral,
  SyntaxKind,
} from "#typescript";
import type { ConfigStore } from "./configStore.ts";
import type { NonRelativePathsProblem, TSConfig } from "./types.ts";
import { findCompilerOptionsProperty } from "./utils.ts";

export function getNonRelativePathsProblems(tsconfigs: TSConfig[], store: ConfigStore): NonRelativePathsProblem[] {
  const problems: NonRelativePathsProblem[] = [];

  for (const tsconfig of tsconfigs) {
    const problematicPaths: StringLiteral[] = [];

    // Traverse the JSON AST to find compilerOptions.paths
    const compilerOptions = findCompilerOptionsProperty(tsconfig.file);
    if (!compilerOptions) {
      continue;
    }

    const compilerOptionsObject = compilerOptions as ObjectLiteralExpression;
    const pathsProperty = compilerOptionsObject.properties.find(
      (prop): prop is PropertyAssignment =>
        prop.kind === SyntaxKind.PropertyAssignment
        && prop.name?.kind === SyntaxKind.StringLiteral
        && (prop.name as StringLiteral).text === "paths",
    );

    if (!pathsProperty || pathsProperty.initializer.kind !== SyntaxKind.ObjectLiteralExpression) {
      continue;
    }

    const effectiveBaseUrl = store.getEffectiveBaseUrlStack(tsconfig);
    if (!effectiveBaseUrl) {
      throw new Error("Expected config searched for `paths` problems to have an effective `baseUrl`");
    }

    const effectivePaths = store.getEffectivePaths(tsconfig);
    if (!effectivePaths) {
      throw new Error("Expected config searched for `paths` problems to have `paths`");
    }

    // Check each path mapping for non-relative paths
    for (const pathMapping of effectivePaths.value.properties) {
      if (pathMapping.kind !== SyntaxKind.PropertyAssignment) {
        continue;
      }

      const pathProperty = pathMapping as PropertyAssignment;
      if (pathProperty.initializer.kind !== SyntaxKind.ArrayLiteralExpression) {
        continue;
      }

      const pathArray = pathProperty.initializer as ArrayLiteralExpression;
      for (const element of pathArray.elements) {
        if (element.kind === SyntaxKind.StringLiteral) {
          const pathString = element as StringLiteral;
          const pathValue = pathString.text;

          // Check if the path is non-relative (doesn't start with ./ or ../)
          if (!pathValue.startsWith("./") && !pathValue.startsWith("../")) {
            problematicPaths.push(pathString);
          }
        }
      }
    }

    if (problematicPaths.length > 0) {
      problems.push({
        kind: "NonRelativePaths",
        tsconfig,
        problematicPaths,
        effectiveBaseUrl: effectiveBaseUrl[0],
        effectivePaths,
      });
    }
  }

  return problems;
}
