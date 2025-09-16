import { type ArrayLiteralExpression, type PropertyAssignment, type StringLiteral, SyntaxKind } from "#typescript";
import { dirname, resolve } from "node:path";
import type { ConfigStore } from "./configStore.ts";
import type { PathsProblem, TSConfig } from "./types.ts";
import { findCompilerOptionsProperty, toPath } from "./utils.ts";

export function getPathsProblems(tsconfigs: TSConfig[], store: ConfigStore): PathsProblem[] {
  const problems: PathsProblem[] = [];

  for (const tsconfig of tsconfigs) {
    const problematicPaths: StringLiteral[] = [];

    // Traverse the JSON AST to find compilerOptions.paths
    const compilerOptions = findCompilerOptionsProperty(tsconfig.file);
    if (!compilerOptions) {
      continue;
    }

    const effectiveBaseUrl = store.getEffectiveBaseUrlStack(tsconfig);
    if (!effectiveBaseUrl) {
      throw new Error("Expected config searched for `paths` problems to have an effective `baseUrl`");
    }

    // If the baseUrl applied to these paths is not the tsconfig directory, each path entry
    // must be updated, even if it's already relative.
    const currentBaseUrl = toPath(
      resolve(dirname(effectiveBaseUrl[0].definedIn.fileName), effectiveBaseUrl[0].value.text),
    );
    const preservedBaseUrl = effectiveBaseUrl.find(b => b.definedIn.fileName.includes("/node_modules/"));
    const baseUrlAfterRemoval = preservedBaseUrl
      ? toPath(resolve(dirname(preservedBaseUrl.definedIn.fileName), preservedBaseUrl.value.text))
      : toPath(dirname(tsconfig.fileName));
    const pathsBaseWillChange = currentBaseUrl !== baseUrlAfterRemoval;

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
          if (pathsBaseWillChange || (!pathValue.startsWith("./") && !pathValue.startsWith("../"))) {
            problematicPaths.push(pathString);
          }
        }
      }
    }

    if (problematicPaths.length > 0) {
      problems.push({
        kind: pathsBaseWillChange ? "BaseChanged" : "NonRelative",
        tsconfig,
        problematicPaths,
        effectiveBaseUrl: effectiveBaseUrl[0],
        effectivePaths,
      });
    }
  }

  return problems;
}
