import {
  type ArrayLiteralExpression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type StringLiteral,
  SyntaxKind,
} from "typescript";
import type { NonRelativePathsProblem, TSConfig } from "./types.ts";
import { getEffectiveBaseUrl } from "./utils.ts";

export function getNonRelativePathsProblems(tsconfigs: TSConfig[]): NonRelativePathsProblem[] {
  const problems: NonRelativePathsProblem[] = [];

  for (const tsconfig of tsconfigs) {
    const problematicPaths: StringLiteral[] = [];

    // Traverse the JSON AST to find compilerOptions.paths
    const rootExpression = tsconfig.file.statements[0]?.expression;
    if (!rootExpression || rootExpression.kind !== SyntaxKind.ObjectLiteralExpression) {
      continue;
    }

    const rootObject = rootExpression as ObjectLiteralExpression;
    const compilerOptionsProperty = rootObject.properties.find(
      (prop): prop is PropertyAssignment =>
        prop.kind === SyntaxKind.PropertyAssignment
        && prop.name?.kind === SyntaxKind.StringLiteral
        && (prop.name as StringLiteral).text === "compilerOptions",
    );

    if (!compilerOptionsProperty || compilerOptionsProperty.initializer.kind !== SyntaxKind.ObjectLiteralExpression) {
      continue;
    }

    const compilerOptions = compilerOptionsProperty.initializer as ObjectLiteralExpression;
    const pathsProperty = compilerOptions.properties.find(
      (prop): prop is PropertyAssignment =>
        prop.kind === SyntaxKind.PropertyAssignment
        && prop.name?.kind === SyntaxKind.StringLiteral
        && (prop.name as StringLiteral).text === "paths",
    );

    if (!pathsProperty || pathsProperty.initializer.kind !== SyntaxKind.ObjectLiteralExpression) {
      continue;
    }

    const effectiveBaseUrl = getEffectiveBaseUrl(tsconfig);
    if (!effectiveBaseUrl) {
      continue;
    }

    const paths = pathsProperty.initializer as ObjectLiteralExpression;

    // Check each path mapping for non-relative paths
    for (const pathMapping of paths.properties) {
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
        effectiveBaseUrl,
      });
    }
  }

  return problems;
}
