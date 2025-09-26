import ts, {
  getTrailingCommentRanges,
  normalizeSlashes,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type StringLiteral,
  SyntaxKind,
  type TsConfigSourceFile,
} from "#typescript";
import { dirname, join, relative, resolve } from "node:path";
import type { ConfigValue, EditDescription, ExtendedConfig, ProjectTSConfig, TextEdit, TSConfig } from "./types.ts";

export function useCaseSensitiveFileNames() {
  return ts.sys.useCaseSensitiveFileNames;
}

export const getCanonicalFileName = ts.createGetCanonicalFileName(ts.sys.useCaseSensitiveFileNames);

export function toPath(fileName: string): string {
  return ts.toPath(fileName, ts.sys.getCurrentDirectory(), getCanonicalFileName);
}

export function isProjectTSConfig(tsconfig: TSConfig): tsconfig is ProjectTSConfig {
  return "parsed" in tsconfig && tsconfig.parsed != undefined;
}

export function isExtendedTSConfig(tsconfig: TSConfig): tsconfig is ExtendedConfig {
  return "extended" in tsconfig && tsconfig.extended != undefined;
}

export function insertPropertyIntoObject(
  fileName: string,
  targetObject: ObjectLiteralExpression,
  newPropertyText: string | ((indent: string) => string),
  sourceFile: TsConfigSourceFile,
  description?: EditDescription,
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
    description,
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

/**
 * Create TextEdits that copy path mappings from an inherited paths object into
 * the provided tsconfig. The entries are transformed so that their targets are
 * relative to the target tsconfig file location.
 *
 * If `compilerOptionsObject` is provided we'll add a `paths` property to it.
 * Otherwise, if `rootObject` is provided we'll create a `compilerOptions`
 * property containing the `paths` mapping.
 */
export function createCopiedPathsEdits(
  tsconfig: TSConfig,
  includeWildcard = true,
): TextEdit[] | undefined {
  // Determine inherited paths and base directory from the TSConfig itself.
  if (!tsconfig.effectivePaths || tsconfig.effectivePaths.definedIn === tsconfig) return undefined;
  const sourceFile = tsconfig.file;
  const rootObject = sourceFile.statements[0]?.expression as ObjectLiteralExpression | undefined;
  const compilerOptionsObject = findCompilerOptionsProperty(sourceFile);
  const inheritedPathsObject = tsconfig.effectivePaths.value;
  const inheritedBaseDir = tsconfig.effectiveBaseUrlStack && tsconfig.effectiveBaseUrlStack.length > 0
    ? resolve(
      dirname(tsconfig.effectiveBaseUrlStack[0].definedIn.fileName),
      tsconfig.effectiveBaseUrlStack[0].value.text,
    )
    : dirname(tsconfig.fileName);

  const extendedPaths: Record<string, string[]> = {};
  for (const prop of inheritedPathsObject.properties) {
    if (
      prop.kind === SyntaxKind.PropertyAssignment
      && prop.name?.kind === SyntaxKind.StringLiteral
      && (prop.name as StringLiteral).text !== "*"
      && prop.initializer.kind === SyntaxKind.ArrayLiteralExpression
    ) {
      const key = (prop.name as StringLiteral).text;
      const elements = (prop.initializer as any).elements;
      const values: string[] = [];
      for (const e of elements) {
        if (e.kind === SyntaxKind.StringLiteral) {
          const absolute = resolve(inheritedBaseDir, (e as StringLiteral).text);
          const rel = normalizeSlashes(relative(dirname(tsconfig.fileName), absolute));
          values.push(rel.startsWith("./") || rel.startsWith("../") ? rel : `./${rel}`);
        }
      }
      if (values.length > 0) extendedPaths[key] = values;
    }
  }

  // Optionally include wildcard mapping
  if (includeWildcard) {
    if (!tsconfig.effectiveBaseUrlStack) {
      throw new Error("Cannot add wildcard path mapping when baseUrl is not set");
    }
    extendedPaths["*"] = [getPathMappingText(tsconfig, tsconfig.effectiveBaseUrlStack)];
  }

  const buildPropertyText = (indent: string) => {
    // Determine indentation for each property line
    const subIndent = indent + "  ";
    const properties = Object.entries(extendedPaths)
      .map(([k, v]) => `${subIndent}"${k}": [${v.map(p => `"${p}"`).join(", ")}]`)
      .join(",\n");
    return `"paths": {\n${properties}\n${indent}}`;
  };

  if (compilerOptionsObject) {
    return insertPropertyIntoObject(
      tsconfig.fileName,
      compilerOptionsObject,
      buildPropertyText,
      sourceFile,
      includeWildcard
        ? "added wildcard path mapping, copied mappings from extended config"
        : "copied mappings from extended config",
    );
  }

  // If compilerOptions doesn't exist, add the whole compilerOptions object
  if (rootObject) {
    return insertPropertyIntoObject(
      tsconfig.fileName,
      rootObject,
      (indent: string) => `"compilerOptions": { ${buildPropertyText(indent)} }`,
      sourceFile,
      includeWildcard
        ? "added wildcard path mapping, copied mappings from extended config"
        : "copied mappings from extended config",
    );
  }

  return undefined;
}

export function getPathMappingText(
  tsconfig: TSConfig,
  effectiveBaseUrlStack: readonly ConfigValue<StringLiteral>[],
): string {
  const baseUrlText = effectiveBaseUrlStack[0].value.text;
  const baseUrlAbsolute = resolve(dirname(effectiveBaseUrlStack[0].definedIn.fileName), baseUrlText);
  const baseUrlRelative = normalizeSlashes(relative(dirname(tsconfig.fileName), baseUrlAbsolute));
  const mappingValue = normalizeSlashes(join(baseUrlRelative, "*"));
  return mappingValue.startsWith("./") || mappingValue.startsWith("../") ? mappingValue : `./${mappingValue}`;
}
