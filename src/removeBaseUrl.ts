import type { ObjectLiteralExpression, PropertyAssignment, StringLiteral, TsConfigSourceFile } from "#typescript";
import { getTrailingCommentRanges, isWhiteSpaceLike, SyntaxKind } from "#typescript";
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
      : getBaseUrlRemovalEdits(tsconfig);
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

/**
 * Finds and creates a text edit to remove the baseUrl property from a tsconfig file.
 */
function getBaseUrlRemovalEdits(tsconfig: TSConfig): TextEdit[] | undefined {
  const sourceFile = tsconfig.file;

  // Find the compilerOptions object
  const compilerOptionsObject = findCompilerOptionsProperty(sourceFile);
  if (!compilerOptionsObject) {
    return undefined;
  }

  // Find the baseUrl property within compilerOptions
  const baseUrlProperty = findBaseUrlProperty(compilerOptionsObject);
  if (!baseUrlProperty) {
    return undefined;
  }

  // Calculate the range to remove, including any trailing comma and whitespace
  return calculateRemovalRanges(baseUrlProperty, compilerOptionsObject, sourceFile);
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

/**
 * Finds the baseUrl property within the compilerOptions object.
 */
function findBaseUrlProperty(compilerOptionsObject: ObjectLiteralExpression): PropertyAssignment | undefined {
  if (compilerOptionsObject.kind !== SyntaxKind.ObjectLiteralExpression) {
    return undefined;
  }

  for (const property of compilerOptionsObject.properties) {
    if (property.kind === SyntaxKind.PropertyAssignment) {
      const propertyAssignment = property as PropertyAssignment;
      const name = propertyAssignment.name;
      if (name.kind === SyntaxKind.StringLiteral && (name as StringLiteral).text === "baseUrl") {
        return propertyAssignment;
      }
    }
  }
  return undefined;
}

function calculateRemovalRanges(
  baseUrlProperty: PropertyAssignment,
  compilerOptionsObject: ObjectLiteralExpression,
  sourceFile: TsConfigSourceFile,
): TextEdit[] {
  const propertyStart = baseUrlProperty.getFullStart();
  const propertyEnd = baseUrlProperty.getEnd();
  const text = sourceFile.getFullText();
  let start = propertyStart;
  let end = propertyEnd;

  // Move end past trailing comma
  const possibleCommaPos = findComma(text, propertyEnd);
  if (possibleCommaPos !== undefined) {
    end = possibleCommaPos + 1;
  }

  // Move end past any trailing comments
  const trailingComments = getTrailingCommentRanges(text, end);
  if (trailingComments) {
    end = trailingComments[trailingComments.length - 1].end;
  }

  const edits: TextEdit[] = [{
    fileName: sourceFile.fileName,
    newText: "",
    start,
    end,
    description: "removed baseUrl",
  }];

  if (
    !compilerOptionsObject.properties.hasTrailingComma
    && compilerOptionsObject.properties.indexOf(baseUrlProperty) === compilerOptionsObject.properties.length - 1
  ) {
    // We removed the last property and there wasn't a trailing comma before, so we need to remove the preceding comma
    const prevProperty = compilerOptionsObject.properties[compilerOptionsObject.properties.length - 2];
    if (prevProperty) {
      const precedingCommaPos = findComma(text, prevProperty.getEnd());
      if (precedingCommaPos !== undefined) {
        edits.push({
          fileName: sourceFile.fileName,
          newText: "",
          start: prevProperty.getEnd(),
          end: precedingCommaPos + 1,
        });
      }
    }
  }
  return edits;
}

function findComma(text: string, position: number): number | undefined {
  while (position < text.length) {
    if (text.charAt(position) === ",") {
      return position;
    }
    if (isWhiteSpaceLike(text.charCodeAt(position))) {
      position++;
    } else {
      break;
    }
  }
  return undefined;
}
