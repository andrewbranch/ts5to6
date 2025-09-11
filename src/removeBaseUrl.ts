import type {
  ExpressionStatement,
  ObjectLiteralExpression,
  PropertyAssignment,
  SourceFile,
  StringLiteral,
  TsConfigSourceFile,
} from "typescript";
import { getTrailingCommentRanges, isWhiteSpaceLike, SyntaxKind } from "typescript";
import type { TextEdit, TSConfig } from "./types.ts";

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
    }];
  }

  const rootExpression = sourceFile.statements[0]?.expression as ObjectLiteralExpression | undefined;
  const compilerOptionsObject = findCompilerOptionsProperty(sourceFile);
  if (!compilerOptionsObject) {
    if (!rootExpression) {
      return undefined;
    }

    const lastProperty = rootExpression.properties[rootExpression.properties.length - 1];
    if (!lastProperty) {
      // Not possible; this config definitely extends something
      return undefined;
    }

    const edits: TextEdit[] = [];
    if (!rootExpression.properties.hasTrailingComma) {
      // We need to add a comma to the last property to add a new one
      edits.push({
        fileName: sourceFile.fileName,
        newText: ",",
        start: lastProperty.getEnd(),
        end: lastProperty.getEnd(),
      });
    }
    const trailingComments = getTrailingCommentRanges(sourceFile.getFullText(), lastProperty.getEnd());
    const end = trailingComments ? trailingComments[trailingComments.length - 1].end : lastProperty.getEnd();
    const indent = lastProperty.getFullText().match(/^\s*/)?.[0] || "";
    edits.push({
      fileName: sourceFile.fileName,
      newText: `\n"${indent}"compilerOptions": {\n${indent.repeat(2)}"baseUrl": null${
        rootExpression.properties.hasTrailingComma ? "," : ""
      }\n${indent}}${rootExpression.properties.hasTrailingComma ? "," : ""}`,
      start: end,
      end: end,
    });
    return edits;
  }

  const lastProperty = compilerOptionsObject.properties[compilerOptionsObject.properties.length - 1];
  if (!lastProperty) {
    return [{
      fileName: sourceFile.fileName,
      newText: `{ "baseUrl": null }${rootExpression?.properties.hasTrailingComma ? "," : ""}`,
      start: compilerOptionsObject.getStart(sourceFile),
      end: compilerOptionsObject.getEnd(),
    }];
  }

  const edits: TextEdit[] = [];
  if (!compilerOptionsObject.properties.hasTrailingComma) {
    // We need to add a comma to the last property to add a new one
    edits.push({
      fileName: sourceFile.fileName,
      newText: ",",
      start: lastProperty.getEnd(),
      end: lastProperty.getEnd(),
    });
  }
  const trailingComments = getTrailingCommentRanges(sourceFile.getFullText(), lastProperty.getEnd());
  const end = trailingComments ? trailingComments[trailingComments.length - 1].end : lastProperty.getEnd();
  const indent = lastProperty.getFullText().match(/^\s*/)?.[0] || "";
  edits.push({
    fileName: sourceFile.fileName,
    newText: `\n${indent}"baseUrl": null${compilerOptionsObject.properties.hasTrailingComma ? "," : ""}`,
    start: end,
    end: end,
  });
  return edits;
}

/**
 * Finds the compilerOptions property in the root object of the tsconfig.
 */
function findCompilerOptionsProperty(sourceFile: TsConfigSourceFile): ObjectLiteralExpression | undefined {
  // Navigate through the AST to find compilerOptions
  const expression = sourceFile.statements[0]?.expression;
  if (expression?.kind === SyntaxKind.ObjectLiteralExpression) {
    const objectLiteral = expression as ObjectLiteralExpression;
    for (const property of objectLiteral.properties) {
      if (property.kind === SyntaxKind.PropertyAssignment) {
        const propertyAssignment = property as PropertyAssignment;
        const name = propertyAssignment.name;
        if (name.kind === SyntaxKind.StringLiteral && (name as StringLiteral).text === "compilerOptions") {
          return propertyAssignment.initializer as ObjectLiteralExpression;
        }
      }
    }
  }
  return undefined;
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
