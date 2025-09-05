import { dirname, resolve } from "node:path";
import ts, { type ObjectLiteralExpression, type PropertyAssignment, type StringLiteral, SyntaxKind } from "typescript";
import type { ProjectTSConfig, TSConfig } from "./types.ts";

export const getCanonicalFileName = ts.createGetCanonicalFileName(ts.sys.useCaseSensitiveFileNames);

export function toPath(fileName: string): string {
  return ts.toPath(fileName, ts.sys.getCurrentDirectory(), getCanonicalFileName);
}

export function isProjectTSConfig(tsconfig: TSConfig): tsconfig is ProjectTSConfig {
  return "parsed" in tsconfig && tsconfig.parsed != null;
}

export function getEffectiveBaseUrl(tsconfig: TSConfig): string | undefined {
  // First check if this is a ProjectTSConfig with parsed compiler options
  if (isProjectTSConfig(tsconfig)) {
    const baseUrl = tsconfig.parsed.options.baseUrl;
    if (baseUrl) {
      return baseUrl;
    }
  }

  // Fallback to looking for baseUrl in the JSON AST
  const rootExpression = tsconfig.file.statements[0]?.expression;
  if (!rootExpression || rootExpression.kind !== SyntaxKind.ObjectLiteralExpression) {
    return undefined;
  }

  const rootObject = rootExpression as ObjectLiteralExpression;
  const compilerOptionsProperty = rootObject.properties.find(
    (prop): prop is PropertyAssignment =>
      prop.kind === SyntaxKind.PropertyAssignment
      && prop.name?.kind === SyntaxKind.StringLiteral
      && (prop.name as StringLiteral).text === "compilerOptions",
  );

  if (!compilerOptionsProperty || compilerOptionsProperty.initializer.kind !== SyntaxKind.ObjectLiteralExpression) {
    return undefined;
  }

  const compilerOptions = compilerOptionsProperty.initializer as ObjectLiteralExpression;
  const baseUrlProperty = compilerOptions.properties.find(
    (prop): prop is PropertyAssignment =>
      prop.kind === SyntaxKind.PropertyAssignment
      && prop.name?.kind === SyntaxKind.StringLiteral
      && (prop.name as StringLiteral).text === "baseUrl",
  );

  if (baseUrlProperty && baseUrlProperty.initializer.kind === SyntaxKind.StringLiteral) {
    const baseUrlLiteral = baseUrlProperty.initializer as StringLiteral;
    return resolve(dirname(tsconfig.fileName), baseUrlLiteral.text);
  }
}
