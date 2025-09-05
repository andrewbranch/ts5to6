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
    const baseUrlEdits = getBaseUrlRemovalEdits(tsconfig);
    if (baseUrlEdits) {
      edits.push(...baseUrlEdits);
    }
  }

  return edits;
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

/**
 * Finds the compilerOptions property in the root object of the tsconfig.
 */
function findCompilerOptionsProperty(sourceFile: SourceFile): ObjectLiteralExpression | undefined {
  // Navigate through the AST to find compilerOptions
  for (const statement of sourceFile.statements) {
    if (statement.kind === SyntaxKind.ExpressionStatement) {
      const expressionStatement = statement as ExpressionStatement;
      const expression = expressionStatement.expression;
      if (expression.kind === SyntaxKind.ObjectLiteralExpression) {
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
