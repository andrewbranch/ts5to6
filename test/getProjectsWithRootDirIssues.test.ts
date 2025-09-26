import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "../src/configStore.ts";
import { getProjectsWithProgramIssues } from "../src/getProgramLevelIssues.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("getProjectsWithRootDirIssues - project-references fixture", () => {
  const tsconfigPath = resolve(__dirname, "fixtures", "rootDir", "project-references", "tsconfig.json");
  const configStore = new ConfigStore(undefined);
  configStore.loadProjects(tsconfigPath);

  const configs = configStore.getConfigs();

  // Should have 3 affected projects: client, server
  assert.equal(configs.affectedProjects.length, 2, "Should have 2 affected projects");
  assert(
    configs.affectedProjects.some(p => p.fileName.includes("client")),
    "Client should detect potential rootDir issue",
  );
  assert(
    configs.affectedProjects.some(p => p.fileName.includes("server")),
    "Server should detect potential rootDir issue",
  );
  assert(
    !configs.affectedProjects.some(p => p.fileName.includes("shared")),
    "Shared should not detect potential rootDir issue",
  );

  // Get the projects that actually have issues with rootDir
  const projectsWithRootDirIssue = getProjectsWithProgramIssues(configs.affectedProjects, "rootDir");

  // Should have 1 project with issues: server (client and shared does not)
  assert.equal(projectsWithRootDirIssue.length, 1, "Should have 1 projects with rootDir issue");

  // Verify which specific projects actually has issue
  assert(projectsWithRootDirIssue[0].fileName.includes("server"), "Server should detect the actual issue");
});
