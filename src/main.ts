import { glob } from "glob";
import { existsSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { ConfigStore } from "./configStore.ts";
import { getNonRelativePathsFixes } from "./getNonRelativePathsFixes.ts";
import { getNonRelativePathsProblems } from "./getNonRelativePathsProblems.ts";
import { Logger } from "./logger.ts";
import { getRemoveBaseUrlEdits } from "./removeBaseUrl.ts";
import type { TextEdit } from "./types.ts";
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
  const logger = new Logger(writeLn || (msg => console.log(msg)));
  logger.heading("TypeScript baseUrl Migration Tool");

  const tsconfigPath = resolveTsconfig(path);

  // Validate that the tsconfig file exists
  if (!existsSync(tsconfigPath)) {
    throw new Error(`TypeScript configuration file not found: ${tsconfigPath}`);
  }

  logger.info(`Analyzing ${logger.file(relative(process.cwd(), tsconfigPath))}`);

  // Find projects and collect tsconfigs
  const configStore = new ConfigStore();
  configStore.loadProjects(tsconfigPath);

  // Discover any additional tsconfigs that extend files we're about to modify
  const workspaceRoot = findWorkspaceRoot(tsconfigPath);
  const globbedTsconfigPaths = await glob("**/tsconfig*.json", {
    cwd: workspaceRoot,
    ignore: ["**/node_modules/**"],
    absolute: true,
  });
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

  // Generate and apply fixes
  const pathFixes = pathsProblems.flatMap(getNonRelativePathsFixes);
  const baseUrlFixes = getRemoveBaseUrlEdits(configs.containsBaseUrl);
  const allFixes = [...pathFixes, ...baseUrlFixes];

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
      const pathFixCount = fixes.filter(f => f.newText.includes("./") || f.newText.includes("../")).length;
      const baseUrlFixCount = fixes.length - pathFixCount;

      logger.success(logger.file(relativePath));
      logger.withIndent(() => {
        if (pathFixCount > 0) {
          logger.list([`${pathFixCount} path mapping${pathFixCount === 1 ? "" : "s"} converted to relative`]);
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
