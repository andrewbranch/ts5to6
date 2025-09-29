import { createProgram, type IssueType } from "#typescript";
import type { ProjectTSConfig } from "./types.ts";

/**
 * Filters affected projects down to ones that actually use baseUrl for module resolution.
 * Creates TypeScript programs and catches "TS_FIX_BASEURL_SIGNAL" errors to detect baseUrl usage.
 */
export function getProjectsWithProgramIssues(
  affectedProjects: readonly ProjectTSConfig[],
  issueType: IssueType,
): ProjectTSConfig[] {
  const projectsUsingBaseUrl: ProjectTSConfig[] = [];

  // Process each project synchronously for now, but structure allows for future parallelization
  for (const project of affectedProjects) {
    if (projectsWithProgramIssueType(project, issueType)) {
      projectsUsingBaseUrl.push(project);
    }
  }

  return projectsUsingBaseUrl;
}

/**
 * Tests if a single project uses baseUrl for module resolution by creating a TypeScript program.
 * Returns true if the patched TypeScript library throws "TS_FIX_BASEURL_SIGNAL".
 */
function projectsWithProgramIssueType(project: ProjectTSConfig, issueType: IssueType): boolean {
  try {
    project.parsed.options.issueType = issueType;
    // Create a TypeScript program for this project
    // The patched TypeScript library will throw "TS_FIX_BASEURL_SIGNAL" if baseUrl is used for resolution
    createProgram({
      rootNames: project.parsed.fileNames,
      options: project.parsed.options,
      projectReferences: project.parsed.projectReferences,
      configFileParsingDiagnostics: project.parsed.errors,
    });

    // If we get here without an error, the project doesn't rely on baseUrl for resolution
    return false;
  } catch (error) {
    switch (issueType) {
      case "baseUrl":
        if (error instanceof Error && error.message.includes("TS_FIX_BASEURL_SIGNAL")) {
          // Project uses baseUrl for module resolution
          return true;
        }
        break;
      case "rootDir":
        if (error instanceof Error && error.message.includes("TS_FIX_ROOTDIR_SIGNAL")) {
          project.rootDirProblem = error.message;
          return true;
        }
        break;
    }
    // Re-throw non-signal errors (these are real compilation issues)
    throw error;
  }
}
