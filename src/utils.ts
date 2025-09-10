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
