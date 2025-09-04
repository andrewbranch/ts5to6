import { extname } from "path";
import {
  type ExtendedConfigCacheEntry,
  formatDiagnostic,
  type FormatDiagnosticsHost,
  type ParseConfigFileHost,
  parseConfigFileTextToJson,
  parseJsonSourceFileConfigFileContent,
  readJsonConfigFile,
  sys,
} from "typescript";
import type { Project, ProjectTSConfig } from "./types.ts";
import { getCanonicalFileName } from "./utils.ts";

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

export function getProjects(tsconfigPath: string): Project[] {
  const tsconfigs = new Map<string, ProjectTSConfig>();
  collectReferences(tsconfigPath);
  return Array.from(tsconfigs.values()).map(tsconfig => ({
    tsconfig,
  }));

  function collectReferences(tsconfigPath: string) {
    const tsconfig = parseTsconfig(tsconfigPath);
    tsconfigs.set(tsconfigPath, tsconfig);
    tsconfig.parsed.projectReferences?.forEach(ref => {
      const resolvedPath = extname(ref.path) === ".json" ? ref.path : ref.path + "/tsconfig.json";
      if (!tsconfigs.has(resolvedPath)) {
        collectReferences(resolvedPath);
      }
    });
  }
}

function parseTsconfig(tsconfigPath: string): ProjectTSConfig {
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
    path: tsconfigPath,
    raw: json.config,
    file: tsconfigSourceFile,
    parsed,
  };
}
