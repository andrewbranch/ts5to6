import { dirname, extname, resolve } from "node:path";
import {
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
  type TsConfigSourceFile,
} from "typescript";
import type { ConfigValue, ProjectTSConfig, TSConfig } from "./types.ts";
import { getCanonicalFileName, isProjectTSConfig, toPath } from "./utils.ts";

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

export interface Configs {
  tsconfigCount: number;
  projectCount: number;
  containsPaths: TSConfig[];
  containsBaseUrl: TSConfig[];
  affectedProjects: ProjectTSConfig[];
}

export class ConfigStore {
  projectConfigs = new Map<string, ProjectTSConfig>();
  extendedConfigCache = new Map<string, ExtendedConfigCacheEntry>();

  getConfigs(): Configs {
    const containsBaseUrl = new Map<string, TSConfig>();
    const containsPaths = new Map<string, TSConfig>();
    const affectedProjects: ProjectTSConfig[] = [];

    for (const projectConfig of this.projectConfigs.values()) {
      const effectiveBaseUrl = this.getEffectiveBaseUrl(projectConfig);
      if (effectiveBaseUrl) {
        containsBaseUrl.set(toPath(effectiveBaseUrl.definedIn.fileName), effectiveBaseUrl.definedIn);
        affectedProjects.push(projectConfig);

        const effectivePaths = this.getEffectivePaths(projectConfig);
        if (effectivePaths) {
          containsPaths.set(toPath(effectivePaths.definedIn.fileName), effectivePaths.definedIn);
        }
      }
    }

    return {
      tsconfigCount: this.extendedConfigCache.size + this.projectConfigs.size,
      projectCount: this.projectConfigs.size,
      containsBaseUrl: Array.from(containsBaseUrl.values()),
      containsPaths: Array.from(containsPaths.values()),
      affectedProjects,
    };
  }

  getProjectConfig(fileName: string): TSConfig | undefined {
    const path = toPath(fileName);
    return this.projectConfigs.get(path);
  }

  parseTsconfigIntoSourceFile(tsconfigPath: string, content: string): TsConfigSourceFile {
    return readJsonConfigFile(tsconfigPath, () => content);
  }

  parseTsconfigSourceFileIntoProject(
    sourceFile: TsConfigSourceFile,
    reason: ProjectTSConfig["reason"],
  ): ProjectTSConfig {
    const parsed = parseJsonSourceFileConfigFileContent(
      sourceFile,
      parseConfigHost,
      dirname(sourceFile.fileName),
      undefined,
      sourceFile.fileName,
      undefined,
      undefined,
      this.extendedConfigCache,
    );

    const json = parseConfigFileTextToJson(sourceFile.fileName, sourceFile.text);
    if (json.error) {
      throw new Error(
        `Could not parse tsconfig JSON at path: ${sourceFile.fileName}: ${
          formatDiagnostic(json.error, diagnosticFormatHost)
        }`,
      );
    }

    const projectTsconfig: ProjectTSConfig = {
      fileName: sourceFile.fileName,
      raw: json.config,
      file: sourceFile,
      parsed,
      reason,
    };

    return projectTsconfig;
  }

  getExtendedConfigs(tsconfig: TSConfig): TSConfig[] | undefined {
    return tsconfig.file.extendedSourceFiles
      ?.map((file) => this.extendedConfigCache.get(toPath(file)))
      .filter((e): e is ExtendedConfigCacheEntry => e != undefined)
      .map((e) => {
        const projectConfig = this.projectConfigs.get(toPath(e.extendedResult.fileName));
        if (projectConfig) {
          return projectConfig;
        }
        return {
          fileName: e.extendedResult.fileName,
          raw: e.extendedConfig?.raw,
          file: e.extendedResult,
        };
      });
  }

  getEffectiveBaseUrl(tsconfig: TSConfig): ConfigValue<StringLiteral> | undefined {
    if (tsconfig.effectiveBaseUrl !== undefined) {
      return tsconfig.effectiveBaseUrl || undefined;
    }

    if (isProjectTSConfig(tsconfig) && tsconfig.parsed.options.baseUrl === undefined) {
      return undefined;
    }

    const rootExpression = tsconfig.file.statements[0]?.expression;
    if (!rootExpression || rootExpression.kind !== SyntaxKind.ObjectLiteralExpression) {
      tsconfig.effectiveBaseUrl = false;
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
      tsconfig.effectiveBaseUrl = false;
      return undefined;
    }

    const compilerOptions = compilerOptionsProperty.initializer as ObjectLiteralExpression;
    const baseUrlProperty = compilerOptions.properties.find(
      (prop): prop is PropertyAssignment =>
        prop.kind === SyntaxKind.PropertyAssignment
        && prop.name?.kind === SyntaxKind.StringLiteral
        && (prop.name as StringLiteral).text === "baseUrl",
    );

    if (baseUrlProperty) {
      if (baseUrlProperty.initializer.kind === SyntaxKind.StringLiteral) {
        const baseUrlLiteral = baseUrlProperty.initializer as StringLiteral;
        return tsconfig.effectiveBaseUrl = {
          value: baseUrlLiteral,
          definedIn: tsconfig,
        };
      }
      tsconfig.effectiveBaseUrl = false;
      return undefined;
    }

    const extendedConfigs = this.getExtendedConfigs(tsconfig);
    if (!extendedConfigs) {
      tsconfig.effectiveBaseUrl = false;
      return undefined;
    }

    for (let i = extendedConfigs.length - 1; i >= 0; i--) {
      const extendedConfig = extendedConfigs[i];
      const extendedBaseUrl = this.getEffectiveBaseUrl(extendedConfig);
      if (extendedBaseUrl !== undefined) {
        return tsconfig.effectiveBaseUrl = extendedBaseUrl;
      }
    }

    tsconfig.effectiveBaseUrl = false;
    return undefined;
  }

  getEffectivePaths(tsconfig: TSConfig): ConfigValue<ObjectLiteralExpression> | undefined {
    if (tsconfig.effectivePaths !== undefined) {
      return tsconfig.effectivePaths || undefined;
    }

    const rootExpression = tsconfig.file.statements[0]?.expression;
    if (!rootExpression || rootExpression.kind !== SyntaxKind.ObjectLiteralExpression) {
      tsconfig.effectivePaths = false;
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
      tsconfig.effectivePaths = false;
      return undefined;
    }

    const compilerOptions = compilerOptionsProperty.initializer as ObjectLiteralExpression;
    const pathsProperty = compilerOptions.properties.find(
      (prop): prop is PropertyAssignment =>
        prop.kind === SyntaxKind.PropertyAssignment
        && prop.name?.kind === SyntaxKind.StringLiteral
        && (prop.name as StringLiteral).text === "paths"
        && prop.initializer.kind === SyntaxKind.ObjectLiteralExpression,
    );

    if (pathsProperty) {
      return tsconfig.effectivePaths = {
        value: pathsProperty.initializer as ObjectLiteralExpression,
        definedIn: tsconfig,
      };
    }

    const extendedConfigs = this.getExtendedConfigs(tsconfig);
    if (!extendedConfigs) {
      tsconfig.effectivePaths = false;
      return undefined;
    }
    for (let i = extendedConfigs.length - 1; i >= 0; i--) {
      const extendedConfig = extendedConfigs[i];
      const extendedPaths = this.getEffectivePaths(extendedConfig);
      if (extendedPaths !== undefined) {
        return tsconfig.effectivePaths = extendedPaths;
      }
    }

    tsconfig.effectivePaths = false;
    return undefined;
  }

  loadProjects(tsconfigPath: string) {
    const collectReferences = (tsconfigPath: string, reason: ProjectTSConfig["reason"]) => {
      const tsconfig = this.parseTsconfigSourceFileIntoProject(
        this.parseTsconfigIntoSourceFile(tsconfigPath, sys.readFile(tsconfigPath) ?? ""),
        reason,
      );
      this.projectConfigs.set(toPath(tsconfigPath), tsconfig);
      tsconfig.parsed.projectReferences?.forEach(ref => {
        const resolvedPath = extname(ref.path) === ".json" ? ref.path : ref.path + "/tsconfig.json";
        if (!this.projectConfigs.has(toPath(resolvedPath))) {
          collectReferences(resolvedPath, "referenced");
        }
      });
    };
    collectReferences(tsconfigPath, "entry");
  }

  /**
   * Takes a globbed list of tsconfig paths from the workspace and adds them as projects if:
   * - They have not already been processed
   * - They extend a config we already know about that will have a `baseUrl` removed
   * - They are a leaf in the extends graph of these globbed configs. (We assume if a config
   * - is extended by another config, the user only ever intends to run `tsc` against the
   *   extending config, not the extended one directly.)
   */
  addAffectedConfigsFromWorkspace(tsconfigPaths: readonly string[]) {
    const originalExtendedConfigCache = new Map(this.extendedConfigCache);
    const candidates = new Map<string, ProjectTSConfig>();
    for (const tsconfigPath of tsconfigPaths) {
      const path = toPath(tsconfigPath);
      if (this.projectConfigs.has(path) || this.extendedConfigCache.has(path)) {
        continue;
      }

      const content = sys.readFile(tsconfigPath);
      if (!content || content.indexOf(`"extends"`) === -1) {
        continue;
      }

      const sourceFile = this.parseTsconfigIntoSourceFile(tsconfigPath, content);
      // Somewhat wasteful, collects files/include and we don't know if we need them yet,
      // but TS API doesn't expose a convenient way to parse with extended configs without
      // making a whole ParsedCommandLine.
      const projectConfig = this.parseTsconfigSourceFileIntoProject(sourceFile, "affected");
      candidates.set(path, projectConfig);
    }

    const toAdd = new Map<string, ProjectTSConfig>();
    for (const candidate of candidates.values()) {
      if (this.extendedConfigCache.has(toPath(candidate.fileName))) {
        // Assume that an extended config is not meant to be a project itself
        continue;
      }

      const effectiveBaseUrl = this.getEffectiveBaseUrl(candidate);
      if (
        effectiveBaseUrl
        && (this.projectConfigs.has(toPath(effectiveBaseUrl.definedIn.fileName))
          || originalExtendedConfigCache.has(toPath(effectiveBaseUrl.definedIn.fileName)))
      ) {
        toAdd.set(toPath(candidate.fileName), candidate);
      }
    }

    for (const entry of toAdd) {
      this.projectConfigs.set(entry[0], entry[1]);
    }
  }
}
