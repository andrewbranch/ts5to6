import {
  type ArrayLiteralExpression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type StringLiteral,
  SyntaxKind,
} from "#typescript";
import { dirname, relative, resolve } from "node:path";
import type { ConfigStore } from "./configStore.ts";
import type { ProjectTSConfig, TextEdit, TSConfig } from "./types.ts";
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
      prop =>
        prop.kind === SyntaxKind.PropertyAssignment
        && prop.name?.kind === SyntaxKind.StringLiteral
        && (prop.name as StringLiteral).text === "*",
    );
    if (starProp) {
      return undefined;
    }

    // Insert the `"*"` mapping into the paths object (helper handles empty/non-empty)
    return insertPropertyIntoObject(sourceFile.fileName, pathsObject, `"*": ["./*"]`, sourceFile);
  } else if (tsconfig.effectivePaths && tsconfig.effectivePaths.definedIn !== tsconfig) {
    // If paths was defined in an extended config and we're adding it here, we need to
    // copy the entries from the extended config before adding the wildcard mapping,
    // transforming their relative paths to be correct for this config.
    const extendedPaths: Record<string, string[]> = {};
    const effectiveBaseUrl = tsconfig.effectiveBaseUrlStack
        && resolve(
          dirname(tsconfig.effectiveBaseUrlStack[0].definedIn.fileName),
          tsconfig.effectiveBaseUrlStack[0].value.text,
        ) || dirname(tsconfig.fileName);
    for (const prop of tsconfig.effectivePaths.value.properties) {
      if (
        prop.kind === SyntaxKind.PropertyAssignment
        && prop.name?.kind === SyntaxKind.StringLiteral
        && prop.name.text !== "*"
        && prop.initializer.kind === SyntaxKind.ArrayLiteralExpression
        && (prop.initializer as ArrayLiteralExpression).elements.every(e => e.kind === SyntaxKind.StringLiteral)
      ) {
        extendedPaths[prop.name.text] = (prop.initializer as ArrayLiteralExpression).elements.map(e => {
          const absolute = resolve(effectiveBaseUrl, (e as StringLiteral).text);
          return relative(dirname(tsconfig.fileName), absolute);
        });
      }
    }

    extendedPaths["*"] = ["./*"];
    return insertPropertyIntoObject(
      sourceFile.fileName,
      compilerOptionsObject,
      indent => {
        const subIndent = inferIndent(indent, 2).repeat(3);
        const properties = Object.entries(extendedPaths).map(([k, v]) =>
          `${subIndent}"${k}": [${v.map(p => `"${p}"`).join(", ")}]`
        ).join(",\n");
        return `\"paths\": {\n${properties}\n${indent}}`;
      },
      sourceFile,
      "added wildcard path mapping, copied mappings from extended config",
    );
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
