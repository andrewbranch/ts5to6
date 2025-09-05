import { dirname, resolve } from "node:path";
import ts, {
  type ExtendedConfigCacheEntry,
  formatDiagnostic,
  type FormatDiagnosticsHost,
  type ObjectLiteralExpression,
  type ParseConfigFileHost,
  parseConfigFileTextToJson,
  parseJsonSourceFileConfigFileContent,
  type PropertyAssignment,
  readJsonConfigFile,
  type StringLiteral,
  SyntaxKind,
  sys,
} from "typescript";
import type { ProjectTSConfig, TSConfig } from "./types.ts";

export const getCanonicalFileName = ts.createGetCanonicalFileName(ts.sys.useCaseSensitiveFileNames);

export function toPath(fileName: string): string {
  return ts.toPath(fileName, ts.sys.getCurrentDirectory(), getCanonicalFileName);
}

export function isProjectTSConfig(tsconfig: TSConfig): tsconfig is ProjectTSConfig {
  return "parsed" in tsconfig && tsconfig.parsed != undefined;
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

const diagnosticFormatHost: FormatDiagnosticsHost = {
  getCanonicalFileName,
  getCurrentDirectory: sys.getCurrentDirectory,
  getNewLine: () => sys.newLine,
};

const parseConfigHost: ParseConfigFileHost = {
  useCaseSensitiveFileNames: sys.useCaseSensitiveFileNames,
  readDirectory: sys.readDirectory,
  fileExists: sys.fileExists,
  readFile: sys.readFile,
  getCurrentDirectory: sys.getCurrentDirectory,
  onUnRecoverableConfigFileDiagnostic: diagnostic => {
    throw new Error(`Unrecoverable tsconfig.json error: ${formatDiagnostic(diagnostic, diagnosticFormatHost)}`);
  },
};

export const extendedConfigCache = new Map<string, ExtendedConfigCacheEntry>();

/**
 * Parses a tsconfig file into a ProjectTSConfig with full compiler options resolution
 */
export function parseTsconfig(tsconfigPath: string): ProjectTSConfig {
  const tsconfigSourceFile = readJsonConfigFile(tsconfigPath, sys.readFile);
  const parsed = parseJsonSourceFileConfigFileContent(
    tsconfigSourceFile,
    parseConfigHost,
    sys.getCurrentDirectory(),
    undefined,
    tsconfigPath,
    undefined,
    undefined,
    extendedConfigCache,
  );

  const json = parseConfigFileTextToJson(tsconfigPath, tsconfigSourceFile.text);
  if (json.error) {
    throw new Error(
      `Could not parse tsconfig JSON at path: ${tsconfigPath}: ${formatDiagnostic(json.error, diagnosticFormatHost)}`,
    );
  }

  return {
    fileName: tsconfigPath,
    raw: json.config,
    file: tsconfigSourceFile,
    parsed,
  };
}
