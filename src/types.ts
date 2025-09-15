import type { ObjectLiteralExpression, ParsedCommandLine, StringLiteral, TsConfigSourceFile } from "#typescript";

export interface ConfigValue<T> {
  value: T;
  definedIn: TSConfig;
}

export interface TSConfig {
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
}

export interface ProjectTSConfig extends TSConfig {
  reason: "entry" | "referenced" | "affected";
  parsed: ParsedCommandLine;
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
  | "removed baseUrl"
  | "set baseUrl to null to clear value from extended config";

export interface TextEdit {
  fileName: string;
  newText: string;
  start: number;
  end: number;
  description?: EditDescription;
}
