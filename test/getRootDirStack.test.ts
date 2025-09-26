import { SyntaxKind } from "#typescript";
import assert from "node:assert";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "../src/configStore.ts";
import type { TSConfig } from "../src/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RootDirConfig {
  fileName: string;
  value?: string | SyntaxKind.NullKeyword | false;
  extendedConfigs?: RootDirConfig[];
}

function assertRootDirStack(config: TSConfig, result: RootDirConfig | undefined, prefix: string, seen: Set<TSConfig>) {
  if (seen.has(config)) return;
  seen.add(config);
  assert.equal(resolve(config.fileName), result?.fileName, prefix + "FileName");
  if (!config.rootDirStack) {
    assert.equal(config.rootDirStack, result?.value, prefix + "Value expected to be false");
    return;
  }
  if (!config.rootDirStack.value) {
    assert.equal(config.rootDirStack.value, result?.value, prefix + "value expected to be undefined");
  } else if (config.rootDirStack.value.kind === SyntaxKind.StringLiteral) {
    assert.equal(config.rootDirStack.value.text, result?.value, prefix + "Value expected to be string with text");
  } else {
    assert.equal(config.rootDirStack.value.kind, result?.value, prefix + "Value expected to be null literal");
  }
  if (config.rootDirStack.extendedConfigs) {
    for (let index = config.rootDirStack.extendedConfigs.length - 1; index >= 0; index--) {
      assertRootDirStack(
        config,
        result?.extendedConfigs?.[index],
        `${prefix}->[${index}]${relative(pathInFixture(), config.fileName)} ::`,
        seen,
      );
    }
  }
}

function pathInFixture(...fixture: string[]) {
  return resolve(__dirname, "fixtures", "rootDir", ...fixture);
}

function getRootDirStack(...fixture: string[]) {
  const tsconfigPath = pathInFixture(...fixture);
  const configStore = new ConfigStore(undefined);
  configStore.loadProjects(tsconfigPath);
  const config = configStore.getProjectConfig(tsconfigPath)!;
  configStore.getRootDirStack(config);
  return {
    tsconfigPath,
    assertRootDirStack: (result: RootDirConfig | undefined) => assertRootDirStack(config, result, "", new Set()),
  };
}

test("getRootDirStack - multiple extends fixture 1", () => {
  const { tsconfigPath, assertRootDirStack } = getRootDirStack("multiple-extends-1", "tsconfig.json");
  assertRootDirStack({
    fileName: tsconfigPath,
    extendedConfigs: [
      {
        fileName: pathInFixture("multiple-extends-1", "tsconfig.base.json"),
        extendedConfigs: [
          {
            fileName: pathInFixture("multiple-extends-1", "node_modules", "@tsconfig", "docusaurus", "tsconfig.json"),
          },
        ],
      },
    ],
  });
});

test("getRootDirStack - multiple extends fixture 2", () => {
  const { tsconfigPath, assertRootDirStack } = getRootDirStack("multiple-extends-2", "tsconfig.json");
  assertRootDirStack({
    fileName: tsconfigPath,
    value: SyntaxKind.NullKeyword,
    extendedConfigs: [
      {
        fileName: pathInFixture("multiple-extends-2", "tsconfig.other.json"),
        value: "${configDir}/src",
        extendedConfigs: [
          {
            fileName: pathInFixture("multiple-extends-2", "node_modules", "@tsconfig", "docusaurus", "tsconfig.json"),
            value: "${configDir}",
          },
          {
            fileName: pathInFixture("multiple-extends-2", "tsconfig.base.json"),
          },
        ],
      },
    ],
  });
});
