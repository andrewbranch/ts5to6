import { glob } from "glob";
import { existsSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { ConfigStore } from "./configStore.ts";
import { getNonRelativePathsFixes } from "./getNonRelativePathsFixes.ts";
import { getNonRelativePathsProblems } from "./getNonRelativePathsProblems.ts";
import { getProjectsUsingBaseUrlForResolution } from "./getResolutionUsesBaseUrlProblems.ts";
import { selectTsconfigForAddingPaths, getAddWildcardPathsEdits } from "./getResolutionUsesBaseUrlFixes.ts";
import { Logger } from "./logger.ts";
import { getRemoveBaseUrlEdits } from "./removeBaseUrl.ts";
import type { TextEdit, TSConfig } from "./types.ts";
import { writeFixes } from "./writeFixes.ts";

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

export default async function fixBaseURL(path: string, writeLn?: (msg: any) => void): Promise<void> {
  const { logger, tsconfigPath, workspaceRoot } = setup(path, writeLn);

  // Discover any additional tsconfigs that extend files we're about to modify
  const globbedTsconfigPaths = await glob("**/tsconfig*.json", {
    cwd: workspaceRoot,
    ignore: ["**/node_modules/**"],
    absolute: true,
  });

  fixBaseURLWorker(tsconfigPath, globbedTsconfigPaths, logger);
}

export function fixBaseURLSync(path: string, writeLn?: (msg: any) => void): void {
  const { logger, tsconfigPath, workspaceRoot } = setup(path, writeLn);

  // Discover any additional tsconfigs that extend files we're about to modify
  const globbedTsconfigPaths = glob.sync("**/tsconfig*.json", {
    cwd: workspaceRoot,
    ignore: ["**/node_modules/**"],
    absolute: true,
  });

  fixBaseURLWorker(tsconfigPath, globbedTsconfigPaths, logger);
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

function fixBaseURLWorker(tsconfigPath: string, globbedTsconfigPaths: string[], logger: Logger): void {
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
  const pathsProblems = getNonRelativePathsProblems(configs.containsPaths, configStore);

  if (pathsProblems.length === 0) {
    logger.success("No non-relative path mappings found");
  } else {
    logger.info(
      `Found non-relative path mappings in ${logger.number(pathsProblems.length)} file${
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
  const resolutionFixes: TextEdit[] = [];
  for (const target of resolutionTargets.values()) {
    const edits = getAddWildcardPathsEdits(target);
    if (edits) resolutionFixes.push(...edits);
  }
  if (resolutionFixes.length > 0) {
    logger.info(`${logger.number(resolutionFixes.length)} fix${resolutionFixes.length===1?"":"s"} to add wildcard paths will be applied`);
  }
  
  // Generate and apply fixes
  const pathFixes = pathsProblems.flatMap(getNonRelativePathsFixes);
  const baseUrlFixes = getRemoveBaseUrlEdits(configs.containsBaseUrl);
  // Apply path fixes first, then add wildcard paths for resolution, then remove baseUrl
  const allFixes = [...pathFixes, ...resolutionFixes, ...baseUrlFixes];

  if (allFixes.length === 0) {
    logger.success("No changes needed!");
    return;
  }

  // Group fixes by file for reporting
  const fixesByFile = new Map<string, TextEdit[]>();
  for (const fix of allFixes) {
    const fixes = fixesByFile.get(fix.fileName) || [];
    fixes.push(fix);
    fixesByFile.set(fix.fileName, fixes);
  }

  logger.step("Applying changes...");
  writeFixes(allFixes);

  // Final report
  logger.subheading("Migration Complete!");
  logger.success(`Modified ${logger.number(fixesByFile.size)} file${fixesByFile.size === 1 ? "" : "s"}:`);

  logger.withIndent(() => {
    for (const [fileName, fixes] of fixesByFile) {
      const relativePath = relative(process.cwd(), fileName);
      const pathFixCount = fixes.filter(
        f => (f.newText.includes("./") || f.newText.includes("../")) && !f.newText.includes('\"*\":'),
      ).length;
      const wildcardAddCount = fixes.filter(f => f.newText.includes('\"*\":')).length;
      const baseUrlFixCount = fixes.length - pathFixCount - wildcardAddCount;

      logger.success(logger.file(relativePath));
      logger.withIndent(() => {
        if (pathFixCount > 0) {
          logger.list([`${pathFixCount} path mapping${pathFixCount === 1 ? "" : "s"} converted to relative`]);
        }
        if (wildcardAddCount > 0) {
          logger.list([`${wildcardAddCount} wildcard path mapping${wildcardAddCount === 1 ? "" : "s"} added`]);
        }
        if (baseUrlFixCount > 0) {
          logger.list(["baseUrl removed"]);
        }
      });
    }
  });
}

function resolveTsconfig(path: string) {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  if (extname(abs).toLowerCase() === ".json") {
    return abs;
  }
  return resolve(abs, "tsconfig.json");
}
