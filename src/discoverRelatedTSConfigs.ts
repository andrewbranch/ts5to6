import { glob } from "glob";
import { dirname, resolve } from "node:path";
import type { TSConfig } from "./types.ts";
import { parseTsconfig } from "./utils.ts";

/**
 * Discovers all tsconfig*.json files that might extend any of the given tsconfigs.
 * This prevents issues where modifying a base tsconfig breaks other tsconfigs that extend it.
 */
export async function discoverRelatedTSConfigs(
  tsconfigs: TSConfig[],
  workspaceRoot: string,
): Promise<TSConfig[]> {
  // Find all tsconfig*.json files in the workspace
  const tsconfigPaths = await glob("**/tsconfig*.json", {
    cwd: workspaceRoot,
    ignore: ["**/node_modules/**"],
    absolute: true,
  });

  const relatedConfigs: TSConfig[] = [];
  const existingPaths = new Set(tsconfigs.map(tc => tc.fileName));

  for (const path of tsconfigPaths) {
    // Skip if we already have this tsconfig
    if (existingPaths.has(path)) {
      continue;
    }

    try {
      const tsconfig = parseTsconfig(path);

      // Check if this tsconfig extends any of our target tsconfigs
      if (extendsAnyOf(tsconfig, tsconfigs)) {
        relatedConfigs.push(tsconfig);
        existingPaths.add(path);
      }
    } catch (error) {
      // Skip invalid tsconfig files
      console.warn(`Warning: Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return relatedConfigs;
}

/**
 * Checks if a tsconfig extends any of the given tsconfigs
 */
function extendsAnyOf(tsconfig: TSConfig, targetConfigs: TSConfig[]): boolean {
  const extendsValue = tsconfig.raw?.extends;
  if (!extendsValue) {
    return false;
  }

  // Handle both string and array extends
  const extendsPaths = Array.isArray(extendsValue) ? extendsValue : [extendsValue];

  for (const extendPath of extendsPaths) {
    // Resolve the extend path relative to the current tsconfig
    let resolvedPath = resolve(dirname(tsconfig.fileName), extendPath);

    // If the extend path doesn't end with .json, add it
    if (!extendPath.endsWith(".json")) {
      resolvedPath += ".json";
    }

    // Check if it matches any of our target configs
    if (targetConfigs.some(tc => tc.fileName === resolvedPath)) {
      return true;
    }
  }

  return false;
}
