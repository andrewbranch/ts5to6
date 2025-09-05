import type {
  ParsedCommandLine,
  ResolvedModuleFull,
  StringLiteral,
  StringLiteralLike,
  TsConfigSourceFile,
} from "typescript";

export interface TSConfig {
  fileName: string;
  raw: any;
  file: TsConfigSourceFile;
}

export interface ProjectTSConfig extends TSConfig {
  parsed: ParsedCommandLine;
}

export interface Project {
  tsconfig: ProjectTSConfig;
}

export interface NonRelativePathsProblem {
  kind: "NonRelativePaths";
  tsconfig: TSConfig;
  effectiveBaseUrl: string;
  problematicPaths: StringLiteral[];
}

export interface ResolutionUsesBaseUrlProblem {
  kind: "ResolutionUsesBaseUrl";
  project: Project;
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
