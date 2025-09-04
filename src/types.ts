import type { ParsedCommandLine, Program, ResolvedModuleFull, StringLiteralLike, TsConfigSourceFile } from "typescript";

export interface TSConfig {
  path: string;
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
}

export interface ResolutionUsesBaseUrlProblem {
  kind: "ResolutionUsesBaseUrl";
  project: Project;
  moduleSpecifier: StringLiteralLike;
  resolvedModule: ResolvedModuleFull;
}

export type Problem = NonRelativePathsProblem | ResolutionUsesBaseUrlProblem;
