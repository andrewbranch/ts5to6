import ts, {
  getTrailingCommentRanges,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type StringLiteral,
  SyntaxKind,
  type TsConfigSourceFile
} from "typescript";
import type { ProjectTSConfig, TextEdit, TSConfig } from "./types.ts";

export const getCanonicalFileName = ts.createGetCanonicalFileName(ts.sys.useCaseSensitiveFileNames);

export function toPath(fileName: string): string {
  return ts.toPath(fileName, ts.sys.getCurrentDirectory(), getCanonicalFileName);
}

export function isProjectTSConfig(tsconfig: TSConfig): tsconfig is ProjectTSConfig {
  return "parsed" in tsconfig && tsconfig.parsed != undefined;
}

export function insertPropertyIntoObject(
  fileName: string,
  targetObject: ObjectLiteralExpression,
  newPropertyText: string | ((indent: string) => string),
  sourceFile: TsConfigSourceFile,
): TextEdit[] {
  const text = sourceFile.getFullText();

  const computeText = (indentForProperty: string) =>
    typeof newPropertyText === "function" ? newPropertyText(indentForProperty) : newPropertyText;

  // If the object has no properties, replace its contents with the new property text
  if (targetObject.properties.length === 0) {
    const replacement = computeText("");
    return [{
      fileName,
      newText: `{ ${replacement} }`,
      start: targetObject.getStart(sourceFile),
      end: targetObject.getEnd(),
    }];
  }

  const lastProperty = targetObject.properties[targetObject.properties.length - 1];
  const edits: TextEdit[] = [];
  let end = lastProperty.getEnd();

  // If there's no trailing comma after the last property, insert one so we can append
  if (!targetObject.properties.hasTrailingComma) {
    edits.push({
      fileName,
      newText: ",",
      start: end,
      end: end,
    });
  } else {
    end = text.indexOf(",", end) + 1; // Move end to after the comma
  }

  const trailingComments = getTrailingCommentRanges(text, lastProperty.getEnd());
  end = trailingComments ? trailingComments[trailingComments.length - 1].end : end;
  // Determine the indentation for inserted properties by locating the
  // whitespace immediately preceding the property's opening quote on the
  // same line. This avoids capturing leading newlines into the indent.
  const fullText = lastProperty.getFullText(sourceFile);
  const indentMatch = fullText.match(/^([ \t]*)"/m);
  const indent = indentMatch ? indentMatch[1] : "";

  const newText = computeText(indent);
  edits.push({
    fileName,
    newText: `\n${indent}${newText}${targetObject.properties.hasTrailingComma ? "," : ""}`,
    start: end,
    end: end,
  });

  return edits;
}

export function findCompilerOptionsProperty(sourceFile: TsConfigSourceFile): ObjectLiteralExpression | undefined {
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
