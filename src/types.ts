import type {
  ExtendedConfigCacheEntry,
  NullLiteral,
  ObjectLiteralExpression,
  ParsedCommandLine,
  StringLiteral,
  TsConfigSourceFile,
} from "#typescript";

export interface ConfigValue<T> {
  value: T;
  definedIn: TSConfig;
}

export interface RootDirStack {
  value: StringLiteral | NullLiteral | undefined;
  extendedConfigs?: TSConfig[];
}

export interface TSConfigBase {
  fileName: string;
  raw: any;
  file: TsConfigSourceFile;
  /**
   * The stack of `baseUrl` values that affect this config. The first item is the
   * one currently taking effect, and each consecutive item is the next one that
   * will take effect if the previous one is removed.
   */
  effectiveBaseUrlStack?: ConfigValue<StringLiteral>[] | false;
  effectivePaths?: ConfigValue<ObjectLiteralExpression> | false;
  rootDirStack?: RootDirStack | false;
}

export type TSConfig = ProjectTSConfig | ExtendedConfig;

export type RootDirProblem = string;

export interface ProjectTSConfig extends TSConfigBase {
  reason: "entry" | "referenced" | "affected";
  parsed: ParsedCommandLine;
  rootDirProblem?: RootDirProblem;
}

export interface ExtendedConfig extends TSConfigBase {
  extended: ExtendedConfigCacheEntry;
}

export interface PathsProblem {
  kind: "NonRelative" | "BaseChanged";
  tsconfig: TSConfig;
  effectiveBaseUrl: ConfigValue<StringLiteral>;
  effectivePaths: ConfigValue<ObjectLiteralExpression>;
  problematicPaths: StringLiteral[];
}

export type EditDescription =
  | "converted path mapping to relative"
  | "rebased path mapping against tsconfig directory"
  | "added wildcard path mapping"
  | "added wildcard path mapping, copied mappings from extended config"
  | "copied mappings from extended config"
  | "removed baseUrl"
  | "set baseUrl to null to clear value from extended config"
  | "set rootDir to new value"
  | "add rootDir to existing compilerOptions"
  | "add compilerOptions to add rootDir"
  | "removed rootDir";

export interface TextEdit {
  fileName: string;
  newText: string;
  start: number;
  end: number;
  description?: EditDescription;
}
