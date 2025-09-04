import { z } from "zod";
import type { NonRelativePathsProblem, TSConfig } from "./types.ts";

// Zod schema for safely parsing tsconfig.raw.compilerOptions.paths
const PathsSchema = z.record(z.string(), z.array(z.string())).optional();
const CompilerOptionsSchema = z.looseObject({
  baseUrl: z.string().optional(),
  paths: PathsSchema,
});
const TSConfigRawSchema = z.looseObject({
  compilerOptions: CompilerOptionsSchema.optional(),
});
export function getNonRelativePathsProblems(tsconfigs: TSConfig[]): NonRelativePathsProblem[] {
  const problems: NonRelativePathsProblem[] = [];

  for (const tsconfig of tsconfigs) {
    const parseResult = TSConfigRawSchema.safeParse(tsconfig.raw);
    if (!parseResult.success) {
      continue;
    }

    const { compilerOptions } = parseResult.data;
    if (!compilerOptions?.paths) {
      continue;
    }

    outer:
    for (const pathList of Object.values(compilerOptions.paths)) {
      for (const pathValue of pathList) {
        if (!pathValue.startsWith("./") && !pathValue.startsWith("../")) {
          problems.push({
            kind: "NonRelativePaths",
            tsconfig,
          });
          break outer;
        }
      }
    }
  }

  return problems;
}
