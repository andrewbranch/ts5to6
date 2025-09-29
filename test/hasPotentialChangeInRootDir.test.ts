import assert from "node:assert";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "../src/configStore.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("hasPotentialChangeInRootDir - multiple extends fixture 1", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "rootDir", "multiple-extends-1", "tsconfig.json");
  const configStore = new ConfigStore(undefined);
  configStore.loadProjects(tsconfigPath);
  assert(
    configStore.hasPotentialChangeInRootDir(configStore.getProjectConfig(tsconfigPath)!),
    "Should find potential problem",
  );
});

test("hasPotentialChangeInRootDir - multiple extends fixture 2", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "rootDir", "multiple-extends-2", "tsconfig.json");
  const configStore = new ConfigStore(undefined);
  configStore.loadProjects(tsconfigPath);
  assert(
    configStore.hasPotentialChangeInRootDir(configStore.getProjectConfig(tsconfigPath)!),
    "Should find potential problem",
  );
});
