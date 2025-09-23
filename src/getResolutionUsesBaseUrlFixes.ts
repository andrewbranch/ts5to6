import {
  normalizeSlashes,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type StringLiteral,
  SyntaxKind,
} from "#typescript";
import { dirname, join, relative, resolve } from "node:path";
import type { ConfigStore } from "./configStore.ts";
import type { ProjectTSConfig, TextEdit, TSConfig } from "./types.ts";
import { createCopiedPathsEdits, findCompilerOptionsProperty, insertPropertyIntoObject } from "./utils.ts";
import { getPathMappingText } from "./utils.ts";

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
export function getAddWildcardPathsEdits(tsconfig: TSConfig, store: ConfigStore): TextEdit[] | undefined {
  // Don't attempt to modify files inside node_modules
  if (tsconfig.fileName.includes("/node_modules/")) {
    return undefined;
  }

  const sourceFile = tsconfig.file;
  const rootExpression = sourceFile.statements[0]?.expression as ObjectLiteralExpression | undefined;
  const compilerOptionsObject = findCompilerOptionsProperty(sourceFile);
  const mappingText = getPathMappingText(tsconfig, store.getEffectiveBaseUrlStack(tsconfig)!);

  // If the compilerOptions object does not exist, create it with paths
  if (!compilerOptionsObject) {
    if (!rootExpression) {
      return undefined;
    }

    // Delegate insertion of the compilerOptions property to the shared helper
    return insertPropertyIntoObject(
      sourceFile.fileName,
      rootExpression,
      `"compilerOptions": { "paths": { "*": ["${mappingText}"] } }`,
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
      prop =>
        prop.kind === SyntaxKind.PropertyAssignment
        && prop.name?.kind === SyntaxKind.StringLiteral
        && (prop.name as StringLiteral).text === "*",
    );
    if (starProp) {
      return undefined;
    }

    // Insert the `"*"` mapping into the paths object (helper handles empty/non-empty)
    return insertPropertyIntoObject(sourceFile.fileName, pathsObject, `"*": ["${mappingText}"]`, sourceFile);
  } else if (store.getEffectivePaths(tsconfig)?.definedIn !== tsconfig) {
    // If paths were inherited from an extended config (e.g. in node_modules), copy the
    // entries into this config and transform their targets so they're relative to
    // this tsconfig file. Delegate to shared helper which returns TextEdits.
    return createCopiedPathsEdits(tsconfig, true);
  }

  // Add a `paths` property to the existing compilerOptions object
  return insertPropertyIntoObject(
    sourceFile.fileName,
    compilerOptionsObject,
    `"paths": { ${mappingText} }`,
    sourceFile,
    "added wildcard path mapping",
  );
}

function inferIndent(indent: string, level: number): string {
  if (!indent) return "";
  if (indent.length % level === 0) {
    return indent[0].repeat(indent.length / level);
  }
  return indent;
}
