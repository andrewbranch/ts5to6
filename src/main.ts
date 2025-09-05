import { existsSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { getAllTSConfigs } from "./getAllTSConfigs.ts";
import { getNonRelativePathsFixes } from "./getNonRelativePathsFixes.ts";
import { getNonRelativePathsProblems } from "./getNonRelativePathsProblems.ts";
import { getProjects } from "./getProjects.ts";
import { logger } from "./logger.ts";
import { getRemoveBaseUrlEdits } from "./removeBaseUrl.ts";
import type { TextEdit } from "./types.ts";
import { writeFixes } from "./writeFixes.ts";

export function main(path: string) {
  logger.heading("TypeScript baseUrl Migration Tool");

  const tsconfigPath = resolveTsconfig(path);

  // Validate that the tsconfig file exists
  if (!existsSync(tsconfigPath)) {
    throw new Error(`TypeScript configuration file not found: ${tsconfigPath}`);
  }

  logger.info(`Analyzing ${logger.file(relative(process.cwd(), tsconfigPath))}`);

  // Find projects and collect tsconfigs
  const projects = getProjects(tsconfigPath);
  const tsconfigs = getAllTSConfigs(projects);

  if (tsconfigs.length > 1) {
    logger.info(`Found ${logger.number(tsconfigs.length)} tsconfig files:`);
    logger.withIndent(() => {
      for (const tsconfig of tsconfigs) {
        logger.info(logger.file(relative(process.cwd(), tsconfig.fileName)));
      }
    });
  }

  // Analyze path problems
  const pathsProblems = getNonRelativePathsProblems(tsconfigs);

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
  const baseUrlFixes = getRemoveBaseUrlEdits(tsconfigs);
  const allFixes = [...pathFixes, ...baseUrlFixes];

  if (allFixes.length === 0) {
    logger.success("No changes needed - all configurations are already correct!");
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

  logger.info("Your TypeScript project has been successfully migrated!");
}

function resolveTsconfig(path: string) {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  if (extname(abs).toLowerCase() === ".json") {
    return abs;
  }
  return resolve(abs, "tsconfig.json");
}
