import assert from "node:assert";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "../src/configStore.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("ConfigStore resolves extended baseUrl when no options are present", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "extends-without-options", "tsconfig.json");
  const store = new ConfigStore();
  store.loadProjects(tsconfigPath);

  const projectConfig = store.getProjectConfig(tsconfigPath);
  assert(projectConfig, "Project config should be loaded");

  const baseUrlStack = store.getEffectiveBaseUrlStack(projectConfig!);
  assert(baseUrlStack && baseUrlStack.length > 0, "Should resolve an effective baseUrl stack");
  assert(
    baseUrlStack![0].definedIn.fileName.endsWith("tsconfig.base.json"),
    "The top of the baseUrl stack should be the base config",
  );
});
