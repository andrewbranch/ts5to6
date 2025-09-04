import { basename, extname, isAbsolute, resolve } from "node:path";
import { getAllTSConfigs } from "./getAllTSConfigs.ts";
import { getNonRelativePathsProblems } from "./getNonRelativePathsProblems.ts";
import { getProjects } from "./getProjects.ts";
import type { Project } from "./types.ts";

export function main(path: string) {
  const tsconfigPath = resolveTsconfig(path);
  const projects = getProjects(tsconfigPath);
  const tsconfigs = getAllTSConfigs(projects);
  const pathsProblems = getNonRelativePathsProblems(tsconfigs);
}

function resolveTsconfig(path: string) {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  if (extname(abs).toLowerCase() === ".json") {
    return abs;
  }
  return resolve(abs, "tsconfig.json");
}
