import { extendedConfigCache } from "./getProjects.ts";
import type { Project, TSConfig } from "./types.ts";
import { toPath } from "./utils.ts";

export function getAllTSConfigs(projects: readonly Project[]): TSConfig[] {
  const tsconfigs = new Map<string, TSConfig>();
  for (const project of projects) {
    collectConfigs(project.tsconfig);
  }
  return Array.from(tsconfigs.values());

  function collectConfigs(tsconfig: TSConfig) {
    if (!tsconfigs.has(tsconfig.fileName)) {
      tsconfigs.set(tsconfig.fileName, tsconfig);
      for (const extended of tsconfig.file.extendedSourceFiles ?? []) {
        const cacheEntry = extendedConfigCache.get(toPath(extended));
        if (cacheEntry?.extendedConfig && !tsconfigs.has(cacheEntry.extendedResult.fileName)) {
          const tsconfig: TSConfig = {
            fileName: cacheEntry.extendedResult.fileName,
            raw: cacheEntry.extendedConfig.raw,
            file: cacheEntry.extendedResult,
          };
          collectConfigs(tsconfig);
        }
      }
    }
  }
}
