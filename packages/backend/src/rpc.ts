/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";
import type { ApplyResult, ColorRule, Project, ValidationResult } from "shared";
import { Setting, colorsEqual, cancelledResult } from "shared";
import { rememberColoredRequests } from "./db";
import {
  getMetadataWithRetry,
  setRequestColors,
} from "./metadata";
import {
  reapplyExistingHistory,
  progress,
  resetProgress,
} from "./history";
import type { ApplySnapshot } from "./history";

export class RPC {
  private static settings = new Setting();
  // Caido owns this ID; compare frontend IDs against it to reject calls delayed across a project switch.
  private static currentProjectId: string | null = null;
  private static settingsRevision = 0;
  private static activeApply: Promise<ApplyResult> | null = null;

  public static setSettings(project: Project): void {
    // Ignore settings sent for a project Caido has already left.
    if (project.id !== RPC.currentProjectId) return;
    RPC.settings = project.setting;
    RPC.settingsRevision += 1;
  }

  public static setActiveProject(projectId: string | null): void {
    if (projectId === RPC.currentProjectId) return;
    RPC.currentProjectId = projectId;
    // Leave coloring inactive until the frontend supplies this project's saved rules.
    RPC.settings = new Setting();
    // Invalidate scans already running; the project-ID guard below rejects old calls arriving afterward.
    RPC.settingsRevision += 1;
    resetProgress();
  }

  public static async recolorize(
    sdk: SDK,
    projectId: string,
  ): Promise<ApplyResult> {
    // Check before starting a new revision: cancellation alone cannot catch a delayed call that has not started.
    if (projectId !== RPC.currentProjectId) return cancelledResult();
    const snapshot: ApplySnapshot = {
      ...RPC.settings.toJSON(),
      projectId: RPC.currentProjectId,
    };
    const revision = ++RPC.settingsRevision;

    // Signal the active run through RPC.settingsRevision, then wait for its current
    // in-flight request to settle before the latest run starts mutating colors.
    const previousApply = RPC.activeApply;
    if (previousApply) await previousApply.catch(() => undefined);
    if (revision !== RPC.settingsRevision) return cancelledResult();

    const run = reapplyExistingHistory(
      sdk,
      snapshot,
      () => revision !== RPC.settingsRevision,
    );
    RPC.activeApply = run;
    try {
      return await run;
    } finally {
      if (RPC.activeApply === run) RPC.activeApply = null;
    }
  }

  public static async validateHttpql(
    sdk: SDK,
    query: string,
  ): Promise<ValidationResult> {
    const value = String(query ?? "").trim();
    if (!value)
      return { ok: false, error: "HTTPQL expression cannot be empty." };
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

  public static async getBackendStatus() {
    return {
      initialized: true,
      enabled: RPC.settings.enabled,
      projectId: RPC.currentProjectId,
      ruleCount: RPC.settings.rules.length,
      progress,
    };
  }

  public static async getProjects(
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

  public static async onInterceptResponse(
    sdk: SDK,
    request: any,
    response: any,
  ): Promise<void> {
    const projectId = RPC.currentProjectId;
    const revision = RPC.settingsRevision;
    if (!projectId || !RPC.settings.enabled) return;
    const match = firstMatchingRule(sdk, RPC.settings.rules, request, response);
    if (!match) return;
    try {
      const requestId = String(request.getId());
      const metadata = await getMetadataWithRetry(sdk, requestId);
      if (revision !== RPC.settingsRevision) return;
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
      await rememberColoredRequests(sdk, projectId, [request.getId()]);
    } catch (error) {
      sdk.console.error(
        `[HTTPQL Colorizer] Failed to color request ${request.getId()}`,
        error,
      );
    }
  }
}

function firstMatchingRule(
  sdk: SDK,
  rules: readonly ColorRule[],
  request: any,
  response: any,
): ColorRule | null {
  for (const rule of rules) {
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
