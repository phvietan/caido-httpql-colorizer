/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";
import type {
  ApplyResult,
  ColorRule,
  Settings,
  ValidationResult,
} from "shared";
import { Project, Setting } from "shared";
import { rememberColoredRequest } from "./db";
import {
  getMetadataWithRetry,
  colorsEqual,
  setRequestColors,
} from "./metadata";
import {
  cancelledResult,
  reapplyExistingHistory,
  progress,
  resetProgress,
} from "./history";
import type { ApplySnapshot } from "./history";

let settings = new Setting();
const projects = new Map<string, Project>();
let activeProjectId: string | null = null;
let settingsRevision = 0;
let activeApply: Promise<ApplyResult> | null = null;

export function setSettings(
  _sdk: SDK,
  next: Settings,
  projectId: string | null,
): void {
  if (!projectId) return;
  const project = new Project(projectId, Setting.normalize(next));
  projects.set(projectId, project);
  if (projectId !== activeProjectId) return;
  settings = project.setting;
  settingsRevision += 1;
}

export function setActiveProject(projectId: string | null): void {
  if (projectId === activeProjectId) return;
  activeProjectId = projectId;
  settings =
    (projectId ? projects.get(projectId)?.setting : undefined) ?? new Setting();
  settingsRevision += 1;
  resetProgress();
}

export async function recolorize(
  sdk: SDK,
  projectId: string,
): Promise<ApplyResult> {
  if (projectId !== activeProjectId) return cancelledResult();
  const snapshot: ApplySnapshot = {
    ...settings.toJSON(),
    projectId: activeProjectId,
  };
  const revision = ++settingsRevision;

  // Signal the active run through settingsRevision, then wait for its current
  // in-flight request to settle before the latest run starts mutating colors.
  const previousApply = activeApply;
  if (previousApply) await previousApply.catch(() => undefined);
  if (revision !== settingsRevision) return cancelledResult();

  const run = reapplyExistingHistory(
    sdk,
    snapshot,
    () => revision !== settingsRevision,
  );
  activeApply = run;
  try {
    return await run;
  } finally {
    if (activeApply === run) activeApply = null;
  }
}

export async function validateHttpql(
  sdk: SDK,
  query: string,
): Promise<ValidationResult> {
  const value = String(query ?? "").trim();
  if (!value) return { ok: false, error: "HTTPQL expression cannot be empty." };
  try {
    await sdk.requests.query().filter(value).first(1).execute();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getBackendStatus() {
  return {
    initialized: true,
    enabled: settings.enabled,
    projectId: activeProjectId,
    ruleCount: settings.rules.length,
    progress,
  };
}

export async function getProjects(
  sdk: SDK,
): Promise<Array<{ id: string; name: string }>> {
  const result = await sdk.graphql.execute<{
    projects: Array<{ id: string; name: string }>;
  }>("query ColorizerProjects { projects { id name } }");
  if (result.errors?.length)
    throw new Error(result.errors.map((error) => error.message).join("; "));
  if (!result.data?.projects)
    throw new Error("Caido returned no project list.");
  return result.data.projects;
}

export async function onInterceptResponse(
  sdk: SDK,
  request: any,
  response: any,
): Promise<void> {
  const projectId = activeProjectId;
  const revision = settingsRevision;
  if (!projectId || !settings.enabled) return;
  const match = firstMatchingRule(sdk, request, response);
  if (!match) return;
  try {
    const requestId = String(request.getId());
    const metadata = await getMetadataWithRetry(sdk, requestId);
    if (revision !== settingsRevision) return;
    if (!metadata)
      throw new Error(`Request ${requestId} does not have metadata.`);
    if (!colorsEqual(metadata.color, match.color)) {
      const result = await setRequestColors(sdk, [
        { requestId, metadataId: metadata.id, color: match.color },
      ]);
      if (result.failures.length)
        throw new Error(
          result.failures[0]?.error ?? "Failed to set request color.",
        );
    }
    await rememberColoredRequest(sdk, projectId, request.getId());
  } catch (error) {
    sdk.console.error(
      `[HTTPQL Colorizer] Failed to color request ${request.getId()}`,
      error,
    );
  }
}

function firstMatchingRule(
  sdk: SDK,
  request: any,
  response: any,
): ColorRule | null {
  for (const rule of settings.rules) {
    if (!rule.enabled || !rule.httpql) continue;
    try {
      if (sdk.requests.matches(rule.httpql, request, response)) return rule;
    } catch (error) {
      sdk.console.error(
        `[HTTPQL Colorizer] Rule "${rule.name}" failed to evaluate`,
        error,
      );
    }
  }
  return null;
}
