import assert from "node:assert";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "../src/configStore.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("getEffectiveBaseUrlStack - multiple baseUrl fixture 1", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "baseUrl", "multiple-baseurl-1", "tsconfig.json");
  const configStore = new ConfigStore();
  configStore.loadProjects(tsconfigPath);
  const baseUrlStack = configStore.getEffectiveBaseUrlStack(configStore.getProjectConfig(tsconfigPath)!);
  assert.deepEqual(baseUrlStack?.map(b => resolve(b.definedIn.fileName)), [
    tsconfigPath,
    resolve(__dirname, "fixtures", "baseUrl", "multiple-baseurl-1", "tsconfig.base.json"),
    resolve(
      __dirname,
      "fixtures",
      "baseUrl",
      "multiple-baseurl-1",
      "node_modules",
      "@tsconfig",
      "docusaurus",
      "tsconfig.json",
    ),
  ]);
});

test("getEffectiveBaseUrlStack - multiple baseUrl fixture 2", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "baseUrl", "multiple-baseurl-2", "tsconfig.json");
  const configStore = new ConfigStore();
  configStore.loadProjects(tsconfigPath);
  const baseUrlStack = configStore.getEffectiveBaseUrlStack(configStore.getProjectConfig(tsconfigPath)!);
  assert.deepEqual(baseUrlStack?.map(b => resolve(b.definedIn.fileName)), [
    tsconfigPath,
    resolve(__dirname, "fixtures", "baseUrl", "multiple-baseurl-2", "tsconfig.other.json"),
    resolve(__dirname, "fixtures", "baseUrl", "multiple-baseurl-2", "tsconfig.base.json"),
    resolve(
      __dirname,
      "fixtures",
      "baseUrl",
      "multiple-baseurl-2",
      "node_modules",
      "@tsconfig",
      "docusaurus",
      "tsconfig.json",
    ),
  ]);
});
