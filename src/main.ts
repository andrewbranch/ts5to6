import { glob } from "glob";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { ConfigStore } from "./configStore.ts";
import { getPathsFixes } from "./getPathsFixes.ts";
import { getPathsProblems } from "./getPathsProblems.ts";
import { getAddWildcardPathsEdits, selectTsconfigForAddingPaths } from "./getResolutionUsesBaseUrlFixes.ts";
import { getProjectsUsingBaseUrlForResolution } from "./getResolutionUsesBaseUrlProblems.ts";
import { Logger } from "./logger.ts";
import { getRemoveBaseUrlEdits } from "./removeBaseUrl.ts";
import type { TextEdit, TSConfig } from "./types.ts";
import { createCopiedPathsEdits } from "./utils.ts";
import { applyEditsToConfigs } from "./writeFixes.ts";

function findWorkspaceRoot(tsconfigPath: string): string {
  let currentDir = dirname(tsconfigPath);

  // Look for package.json to determine workspace root
  while (currentDir !== dirname(currentDir)) {
    if (existsSync(resolve(currentDir, "package.json"))) {
      return currentDir;
    }
    currentDir = dirname(currentDir);
  }

  // Fallback to directory containing the tsconfig if no package.json is found
  return dirname(tsconfigPath);
}

export async function fixBaseURL(path: string, writeLn?: (msg: any) => void): Promise<Record<string, string>> {
  const { logger, tsconfigPath, workspaceRoot } = setup(path, writeLn);

  // Discover any additional tsconfigs that extend files we're about to modify
  const globbedTsconfigPaths = await glob("**/tsconfig*.json", {
    cwd: workspaceRoot,
    ignore: ["**/node_modules/**"],
    absolute: true,
  });

  return fixBaseURLWorker(tsconfigPath, globbedTsconfigPaths, logger);
}

export function fixBaseURLSync(path: string, writeLn?: (msg: any) => void): Record<string, string> {
  const { logger, tsconfigPath, workspaceRoot } = setup(path, writeLn);

  // Discover any additional tsconfigs that extend files we're about to modify
  const globbedTsconfigPaths = glob.sync("**/tsconfig*.json", {
    cwd: workspaceRoot,
    ignore: ["**/node_modules/**"],
    absolute: true,
  });

  return fixBaseURLWorker(tsconfigPath, globbedTsconfigPaths, logger);
}

function setup(
  path: string,
  writeLn?: (msg: any) => void,
): { logger: Logger; tsconfigPath: string; workspaceRoot: string } {
  const logger = new Logger(writeLn || (msg => console.log(msg)));
  logger.heading("TypeScript baseUrl Migration Tool");

  const tsconfigPath = resolveTsconfig(path);

  // Validate that the tsconfig file exists
  if (!existsSync(tsconfigPath)) {
    throw new Error(`TypeScript configuration file not found: ${tsconfigPath}`);
  }

  logger.info(`Analyzing ${logger.file(relative(process.cwd(), tsconfigPath))}`);

  const workspaceRoot = findWorkspaceRoot(tsconfigPath);

  return { logger, tsconfigPath, workspaceRoot };
}

function fixBaseURLWorker(
  tsconfigPath: string,
  globbedTsconfigPaths: string[],
  logger: Logger,
): Record<string, string> {
  // Find projects and collect tsconfigs
  const configStore = new ConfigStore();
  configStore.loadProjects(tsconfigPath);

  configStore.addAffectedConfigsFromWorkspace(globbedTsconfigPaths);

  const configs = configStore.getConfigs();
  logger.info(`Found ${logger.number(configs.tsconfigCount)} tsconfig file${configs.tsconfigCount === 1 ? "" : "s"}`);
  logger.info(
    `${logger.number(configs.containsBaseUrl.length)} define${configs.containsBaseUrl.length === 1 ? "s" : ""} ${
      logger.code("baseUrl")
    }${configs.containsBaseUrl.length > 0 ? ":" : ""}`,
  );
  if (configs.containsBaseUrl.length > 0) {
    logger.withIndent(() => {
      for (const cfg of configs.containsBaseUrl) {
        logger.list([logger.file(relative(process.cwd(), cfg.fileName))]);
      }
    });
    logger.info(
      `${logger.number(configs.containsPaths.length)} define${configs.containsBaseUrl.length === 1 ? "s" : ""} ${
        logger.code("paths")
      }${configs.containsPaths.length > 0 ? ":" : ""}`,
    );
    if (configs.containsPaths.length > 0) {
      logger.withIndent(() => {
        for (const cfg of configs.containsPaths) {
          logger.list([logger.file(relative(process.cwd(), cfg.fileName))]);
        }
      });
    }
    logger.info(
      `${logger.number(configs.affectedProjects.length)} project${
        configs.affectedProjects.length === 1 ? "" : "s"
      } potentially affected by ${logger.code("baseUrl")} change:`,
    );
    logger.withIndent(() => {
      for (const proj of configs.affectedProjects) {
        logger.list([logger.file(relative(process.cwd(), proj.fileName))]);
      }
    });
  }

  // Analyze path problems
  const pathsProblems = getPathsProblems([...configs.containsPaths, ...configs.inheritsPaths], configStore);

  if (pathsProblems.length === 0) {
    logger.success("No path mapping problems found");
  } else {
    logger.info(
      `Found path mapping problems in ${logger.number(pathsProblems.length)} file${
        pathsProblems.length === 1 ? "" : "s"
      }`,
    );
  }

  // Analyze which projects actually use baseUrl for module resolution
  logger.step("Analyzing module resolution dependencies...");
  const projectsUsingBaseUrl = getProjectsUsingBaseUrlForResolution(configs.affectedProjects);

  if (projectsUsingBaseUrl.length === 0) {
    logger.success("No projects rely on baseUrl for module resolution");
  } else {
    logger.warn(
      `${logger.number(projectsUsingBaseUrl.length)} project${
        projectsUsingBaseUrl.length === 1 ? "" : "s"
      } rely on baseUrl for module resolution:`,
    );
    logger.withIndent(() => {
      for (const project of projectsUsingBaseUrl) {
        logger.list([logger.file(relative(process.cwd(), project.fileName))]);
      }
    });
  }

  // Determine the tsconfig files that should receive a wildcard `paths` mapping
  const resolutionTargets = new Map<string, TSConfig>();
  for (const project of projectsUsingBaseUrl) {
    const target = selectTsconfigForAddingPaths(project, configStore);
    if (!target) continue;
    if (target.fileName.includes("/node_modules/")) continue;
    resolutionTargets.set(target.fileName, target);
  }

  // Generate and apply fixes
  const pathFixes: TextEdit[] = [];
  for (const problem of pathsProblems) {
    if (problem.effectivePaths.definedIn !== problem.tsconfig) {
      // Paths were inherited from an extended config, but the baseUrl is changing,
      // so we need to copy them to here. This will interfere with adding a wildcard
      // as a fix later, so combine the fixes here.
      const needsWildcard = resolutionTargets.has(problem.tsconfig.fileName);
      pathFixes.push(...createCopiedPathsEdits(problem.tsconfig, needsWildcard) || []);
      if (needsWildcard) {
        resolutionTargets.delete(problem.tsconfig.fileName);
      }
    } else {
      const edits = getPathsFixes(problem);
      pathFixes.push(...edits);
    }
  }
  const resolutionFixes: TextEdit[] = [];
  for (const target of resolutionTargets.values()) {
    const edits = getAddWildcardPathsEdits(target);
    if (edits) resolutionFixes.push(...edits);
  }

  const baseUrlFixes = getRemoveBaseUrlEdits(configs.containsBaseUrl);
  const allFixes = [...pathFixes, ...resolutionFixes, ...baseUrlFixes];

  if (allFixes.length === 0) {
    logger.success("No changes needed!");
    return {};
  }

  // Group fixes by file for reporting
  const fixesByFile = new Map<string, TextEdit[]>();
  for (const fix of allFixes) {
    const fixes = fixesByFile.get(fix.fileName) || [];
    fixes.push(fix);
    fixesByFile.set(fix.fileName, fixes);
  }

  logger.subheading("Migration Complete!");
  logger.success(`Modified ${logger.number(fixesByFile.size)} file${fixesByFile.size === 1 ? "" : "s"}:`);

  logger.withIndent(() => {
    for (const [fileName, fixes] of fixesByFile) {
      const relativePath = relative(process.cwd(), fileName);

      // Collect counts for non-empty descriptions for the file
      const descCounts = new Map<string, number>();
      for (const f of fixes) {
        if (!f.description) continue;
        descCounts.set(f.description, (descCounts.get(f.description) || 0) + 1);
      }

      logger.success(logger.file(relativePath));
      if (descCounts.size > 0) {
        logger.withIndent(() => {
          for (const [desc, count] of descCounts) {
            logger.list([`${desc} (${logger.number(count)}x)`]);
          }
        });
      }
    }
  });

  logger.step("Computing changes...");
  // Compute the final content map; callers (CLI/tests) can decide to persist
  const edited = applyEditsToConfigs(configStore, allFixes);
  return edited;
}

function resolveTsconfig(path: string) {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  if (extname(abs).toLowerCase() === ".json") {
    return abs;
  }
  return resolve(abs, "tsconfig.json");
}

// For CLI usage we still export a default function that writes to disk
export default async function fixBaseURLCli(path: string, writeLn?: (msg: any) => void): Promise<void> {
  const edited = await fixBaseURL(path, writeLn);
  if (!edited) return;
  for (const [fileName, content] of Object.entries(edited)) {
    // Write files to disk
    writeFileSync(fileName, content, "utf8");
  }
}
