import type { ObjectLiteralExpression, PropertyAssignment, StringLiteral, TsConfigSourceFile } from "#typescript";
import { getPropertyRemovalEdits } from "./optionsPropertyRemoval.ts";
import type { TextEdit, TSConfig } from "./types.ts";
import { findCompilerOptionsProperty, insertPropertyIntoObject } from "./utils.ts";

/**
 * Generates text edits to remove baseUrl from tsconfig files.
 * This should be used after fixing non-relative paths, as the baseUrl
 * becomes unnecessary when all paths are relative.
 */
export function getRemoveBaseUrlEdits(tsconfigs: TSConfig[]): TextEdit[] {
  const edits: TextEdit[] = [];

  for (const tsconfig of tsconfigs) {
    if (tsconfig.fileName.includes("/node_modules/")) {
      // Don't modify tsconfigs in node_modules
      continue;
    }

    const baseUrlEdits = firstExtendedConfigIsInNodeModules(tsconfig)
      ? getBaseUrlNullificationEdits(tsconfig)
      : getPropertyRemovalEdits(tsconfig, "baseUrl");
    if (baseUrlEdits) {
      edits.push(...baseUrlEdits);
    }
  }

  return edits;
}

function firstExtendedConfigIsInNodeModules(tsconfig: TSConfig): boolean {
  if (!tsconfig.effectiveBaseUrlStack) {
    return false;
  }
  return tsconfig.effectiveBaseUrlStack[0].definedIn === tsconfig
      && tsconfig.effectiveBaseUrlStack[1]?.definedIn.fileName.includes("/node_modules/")
    || tsconfig.effectiveBaseUrlStack[0].definedIn.fileName.includes("/node_modules/");
}

function getBaseUrlNullificationEdits(tsconfig: TSConfig): TextEdit[] | undefined {
  const sourceFile = tsconfig.file;
  if (tsconfig.effectiveBaseUrlStack && tsconfig.effectiveBaseUrlStack[0].definedIn === tsconfig) {
    const stringLiteral = tsconfig.effectiveBaseUrlStack[0].value;
    return [{
      fileName: sourceFile.fileName,
      newText: "null",
      start: stringLiteral.getStart(sourceFile),
      end: stringLiteral.getEnd(),
      description: "set baseUrl to null to clear value from extended config",
    }];
  }

  const rootExpression = sourceFile.statements[0]?.expression as ObjectLiteralExpression | undefined;
  const compilerOptionsObject = findCompilerOptionsProperty(sourceFile);
  if (!compilerOptionsObject) {
    if (!rootExpression) {
      return undefined;
    }

    // Use shared helper to insert a compilerOptions property with a nicely indented body
    return insertPropertyIntoObject(
      sourceFile.fileName,
      rootExpression,
      (indent) => `"compilerOptions": {\n${indent.repeat(2)}"baseUrl": null\n${indent}}`,
      sourceFile,
      "set baseUrl to null to clear value from extended config",
    );
  }

  // Insert `"baseUrl": null` into the compilerOptions object (helper handles empty/non-empty)
  return insertPropertyIntoObject(
    sourceFile.fileName,
    compilerOptionsObject,
    `"baseUrl": null`,
    sourceFile,
    "set baseUrl to null to clear value from extended config",
  );
}
