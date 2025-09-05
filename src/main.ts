import { extname, isAbsolute, resolve } from "node:path";
import { getAllTSConfigs } from "./getAllTSConfigs.ts";
import { getNonRelativePathsFixes } from "./getNonRelativePathsFixes.ts";
import { getNonRelativePathsProblems } from "./getNonRelativePathsProblems.ts";
import { getProjects } from "./getProjects.ts";
import { getRemoveBaseUrlEdits } from "./removeBaseUrl.ts";
import { writeFixes } from "./writeFixes.ts";

export function main(path: string) {
  const tsconfigPath = resolveTsconfig(path);
  const projects = getProjects(tsconfigPath);
  const tsconfigs = getAllTSConfigs(projects);
  const pathsProblems = getNonRelativePathsProblems(tsconfigs);
  const fixes = [
    ...pathsProblems.flatMap(getNonRelativePathsFixes),
    ...getRemoveBaseUrlEdits(tsconfigs),
  ];
  writeFixes(fixes);
}

function resolveTsconfig(path: string) {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  if (extname(abs).toLowerCase() === ".json") {
    return abs;
  }
  return resolve(abs, "tsconfig.json");
}
