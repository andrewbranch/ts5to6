import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "../src/configStore.ts";
import { getProjectsWithProgramIssues } from "../src/getProgramLevelIssues.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("getProjectsUsingBaseUrlForResolution - project-references fixture", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "baseUrl", "project-references", "tsconfig.json");
  const configStore = new ConfigStore();
  configStore.loadProjects(tsconfigPath);

  const configs = configStore.getConfigs();

  // Should have 3 affected projects: client, server, and shared
  assert.equal(configs.affectedProjects.length, 3, "Should have 3 affected projects");

  // Get the projects that actually use baseUrl for resolution
  const projectsUsingBaseUrl = getProjectsWithProgramIssues(configs.affectedProjects, "baseUrl");

  // Should have 2 projects using baseUrl: client and server (shared does not)
  assert.equal(projectsUsingBaseUrl.length, 2, "Should have 2 projects using baseUrl for resolution");

  // Verify which specific projects use baseUrl
  assert(projectsUsingBaseUrl.some(p => p.fileName.includes("client")), "Client should use baseUrl");
  assert(projectsUsingBaseUrl.some(p => p.fileName.includes("server")), "Server should use baseUrl");
  assert(!projectsUsingBaseUrl.some(p => p.fileName.includes("shared")), "Shared should not use baseUrl");
});
