import { extname } from "path";
import type { Project, ProjectTSConfig } from "./types.ts";
import { parseTsconfig } from "./utils.ts";

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
