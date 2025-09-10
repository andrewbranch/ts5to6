import type {
  ObjectLiteralExpression,
  ParsedCommandLine,
  ResolvedModuleFull,
  StringLiteral,
  StringLiteralLike,
  TsConfigSourceFile,
} from "typescript";

export interface ConfigValue<T> {
  value: T;
  definedIn: TSConfig;
}

export interface TSConfig {
  fileName: string;
  raw: any;
  file: TsConfigSourceFile;
  effectiveBaseUrl?: ConfigValue<StringLiteral> | false;
  effectivePaths?: ConfigValue<ObjectLiteralExpression> | false;
}

export interface ProjectTSConfig extends TSConfig {
  reason: "entry" | "referenced" | "affected";
  parsed: ParsedCommandLine;
}

export interface NonRelativePathsProblem {
  kind: "NonRelativePaths";
  tsconfig: TSConfig;
  effectiveBaseUrl: ConfigValue<StringLiteral>;
  effectivePaths: ConfigValue<ObjectLiteralExpression>;
  problematicPaths: StringLiteral[];
}

export interface ResolutionUsesBaseUrlProblem {
  kind: "ResolutionUsesBaseUrl";
  project: ProjectTSConfig;
  moduleSpecifier: StringLiteralLike;
  resolvedModule: ResolvedModuleFull;
}

export type Problem = NonRelativePathsProblem | ResolutionUsesBaseUrlProblem;

export interface TextEdit {
  fileName: string;
  newText: string;
  start: number;
  end: number;
}
