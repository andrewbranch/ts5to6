import type { ProjectTSConfig, TSConfig } from "./types.ts";
import type { ConfigStore } from "./configStore.ts";
import type { TextEdit } from "./types.ts";
import {
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type StringLiteral,
  type TsConfigSourceFile,
  SyntaxKind,
  getTrailingCommentRanges,
  isWhiteSpaceLike,
} from "#typescript";
import { findCompilerOptionsProperty, insertPropertyIntoObject } from "./utils.ts";

/**
 * Selects the tsconfig file that should be edited to add a `paths` entry
 * to preserve module resolution behavior after `baseUrl` removal.
 *
 * Selection rules (in order):
 *  1. The nearest config that already defines `paths` (store.getEffectivePaths(project))
 *  2. The nearest config that defines the effective `baseUrl` (store.getEffectiveBaseUrlStack(project)[0])
 *  3. The project's own tsconfig
 */
export function selectTsconfigForAddingPaths(project: ProjectTSConfig, store: ConfigStore): TSConfig {
  const isNodeModule = (cfg: TSConfig) => cfg.fileName.includes("/node_modules/");

  const effectivePaths = store.getEffectivePaths(project);
  if (effectivePaths && !isNodeModule(effectivePaths.definedIn)) {
    return effectivePaths.definedIn;
  }

  const effectiveBaseUrlStack = store.getEffectiveBaseUrlStack(project);
  if (
    effectiveBaseUrlStack && effectiveBaseUrlStack.length > 0 && !isNodeModule(effectiveBaseUrlStack[0].definedIn)
  ) {
    return effectiveBaseUrlStack[0].definedIn;
  }

  return project;
}

/**
 * Generates TextEdits to insert a wildcard `paths` mapping (`"*": ["./*"]`) into a tsconfig.
 */
export function getAddWildcardPathsEdits(tsconfig: TSConfig): TextEdit[] | undefined {
  // Don't attempt to modify files inside node_modules
  if (tsconfig.fileName.includes("/node_modules/")) {
    return undefined;
  }

  const sourceFile = tsconfig.file;
  const text = sourceFile.getFullText();

  const rootExpression = sourceFile.statements[0]?.expression as ObjectLiteralExpression | undefined;
  const compilerOptionsObject = findCompilerOptionsProperty(sourceFile);

  // Helper to create the canonical mapping text
  const mappingText = `"*": ["./*"]`;

  // If the compilerOptions object does not exist, create it with paths
  if (!compilerOptionsObject) {
    if (!rootExpression) {
      return undefined;
    }

    // Delegate insertion of the compilerOptions property to the shared helper
    return insertPropertyIntoObject(
      sourceFile.fileName,
      rootExpression,
      `"compilerOptions": { "paths": { ${mappingText} } }`,
      sourceFile,
    );
  }

  // compilerOptions exists - check for paths property
  const pathsProperty = compilerOptionsObject.properties.find(
    (prop): prop is PropertyAssignment =>
      prop.kind === SyntaxKind.PropertyAssignment
      && prop.name?.kind === SyntaxKind.StringLiteral
      && (prop.name as StringLiteral).text === "paths"
      && prop.initializer.kind === SyntaxKind.ObjectLiteralExpression,
  );

  if (pathsProperty && pathsProperty.initializer.kind === SyntaxKind.ObjectLiteralExpression) {
    const pathsObject = pathsProperty.initializer as ObjectLiteralExpression;

    // Check if `"*"` already exists
    const starProp = pathsObject.properties.find(
      prop => prop.kind === SyntaxKind.PropertyAssignment
        && prop.name?.kind === SyntaxKind.StringLiteral
        && (prop.name as StringLiteral).text === "*",
    );
    if (starProp) {
      return undefined;
    }

    // Insert the `"*"` mapping into the paths object (helper handles empty/non-empty)
    return insertPropertyIntoObject(sourceFile.fileName, pathsObject, `"*": ["./*"]`, sourceFile);
  }

  // Add a `paths` property to the existing compilerOptions object
  return insertPropertyIntoObject(
    sourceFile.fileName,
    compilerOptionsObject,
    `"paths": { ${mappingText} }`,
    sourceFile,
  );
}
