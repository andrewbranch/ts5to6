import {
  getDirectoryPath,
  getNormalizedAbsolutePath,
  getRelativePathFromFile,
  type ObjectLiteralExpression,
  removeTrailingDirectorySeparator,
  SyntaxKind,
} from "#typescript";
import type { ConfigStore } from "./configStore.ts";
import { getPropertyRemovalEdits } from "./optionsPropertyRemoval.ts";
import type { ProjectTSConfig, TextEdit, TSConfig } from "./types.ts";
import {
  findCompilerOptionsProperty,
  getCanonicalFileName,
  insertPropertyIntoObject,
  isExtendedTSConfig,
  isProjectTSConfig,
  toPath,
} from "./utils.ts";

export function getRootDirEdits(tsconfig: ProjectTSConfig, configStore: ConfigStore): TextEdit[] | undefined {
  if (!tsconfig.rootDirProblem) {
    return undefined;
  }

  const issue = decodeIssue(tsconfig.rootDirProblem);

  const stack = configStore.getRootDirStack(tsconfig);
  if (!stack) {
    return undefined;
  }

  if (stack.value?.kind == SyntaxKind.NullKeyword) {
    // Check if we can delete it
    if (stack.extendedConfigs?.length) {
      for (let index = stack.extendedConfigs.length - 1; index >= 0; index--) {
        const rootDir = getRootDir(stack.extendedConfigs[index]);
        if (rootDir) {
          const resolvedRootDir = toPath(rootDir);
          const expectedRootDir = toPath(issue.rootDir);
          if (
            resolvedRootDir === expectedRootDir
            || rootDir.startsWith(`\${configDir}`)
              && toPath(
                  getNormalizedAbsolutePath(
                    rootDir.replace(`\${configDir}`, "./"),
                    getDirectoryPath(tsconfig.fileName),
                  ),
                ) === expectedRootDir
          ) {
            return getPropertyRemovalEdits(tsconfig, "rootDir");
          }
          break;
        }
      }
    }
  }

  // Add to own rootDir property or update it
  return getAddOrUpdateRootDirEdits(tsconfig, inferRelativeFix(issue.rootDir, tsconfig.fileName));
}

function getRootDir(extendedConfig: TSConfig) {
  if (extendedConfig.rootDirStack) {
    if (isProjectTSConfig(extendedConfig)) {
      if (extendedConfig.parsed.options.rootDir) {
        return extendedConfig.parsed.options.rootDir;
      }
    }

    if (isExtendedTSConfig(extendedConfig)) {
      if (extendedConfig.extended.extendedConfig?.options?.rootDir) {
        return extendedConfig.extended.extendedConfig.options.rootDir;
      }
    }
  }
  return undefined;
}

function getAddOrUpdateRootDirEdits(tsconfig: TSConfig, fix: string): TextEdit[] | undefined {
  if (!tsconfig.rootDirStack) {
    return undefined;
  }

  const sourceFile = tsconfig.file;
  if (tsconfig.rootDirStack.value) {
    // Update the existing value
    return [{
      fileName: sourceFile.fileName,
      newText: `"${fix}"`,
      start: tsconfig.rootDirStack.value.getStart(sourceFile),
      end: tsconfig.rootDirStack.value.getEnd(),
      description: "set rootDir to new value",
    }];
  } else {
    const rootDirStr = `"rootDir": "${fix}"`;
    // Add rootDir property
    const rootExpression = sourceFile.statements[0]?.expression as ObjectLiteralExpression | undefined;
    const compilerOptionsObject = findCompilerOptionsProperty(sourceFile);
    if (!compilerOptionsObject) {
      if (!rootExpression) {
        return undefined;
      }

      // Use shared helper to insert a compilerOptions property with a nicely indented body
      return insertPropertyIntoObject(
        sourceFile.fileName,
        rootExpression,
        (indent) => `"compilerOptions": {\n${indent.repeat(2)}${rootDirStr}\n${indent}}`,
        sourceFile,
        "add compilerOptions to add rootDir",
      );
    }

    // Insert root dir into the compilerOptions object (helper handles empty/non-empty)
    return insertPropertyIntoObject(
      sourceFile.fileName,
      compilerOptionsObject,
      rootDirStr,
      sourceFile,
      "add rootDir to existing compilerOptions",
    );
  }
}

function decodeIssue(text: string) {
  const rootDir = removeTrailingDirectorySeparator(stringFromPreFixAndSuffix(text, "5.9:: ", " 6.0::"));
  const rootDir60 = removeTrailingDirectorySeparator(stringFromPreFixAndSuffix(text, "6.0:: ", " <End>"));
  return { text, rootDir, rootDir60 };
}

function stringFromPreFixAndSuffix(text: string, prefix: string, suffix: string) {
  const start = text.indexOf(prefix) + prefix.length;
  const end = text.indexOf(suffix, start);
  return text.substring(start, end);
}

function inferRelativeFix(rootDir: string, inConfig: string) {
  return getRelativePathFromFile(inConfig, rootDir, getCanonicalFileName);
}
