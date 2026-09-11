/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";
import type {
  ApplyResult,
  ApplyProgress,
  ColorRule,
  Settings,
  ValidationResult,
} from "shared";
import { mapWithConcurrency } from "shared";
import {
  forgetColoredRequests,
  ownedRequestIds,
  rememberColoredRequest,
  rememberColoredRequests,
} from "./db";

const metadataQuery = `query getRequestMetadata($id: ID!) { request(id: $id) { metadata { id color } } }`;
const PAGE_SIZE = 500;
const MUTATION_BATCH_SIZE = 20;
const MUTATION_CONCURRENCY = 10;

type ColorUpdate = { requestId: string; metadataId: string; color: string };
type RequestMetadata = { id: string; color: string | null };
type ColorAction = { requestId: string; color: string; ruleName?: string };
type ColorFailure = { requestId: string; error: string };
type ColorUpdateResult = { failures: ColorFailure[] };
type ActionExecutionResult = ColorUpdateResult & {
  skipped: string[];
  successful: string[];
};
type ApplySnapshot = Settings & { projectId: string | null };
let settings: Settings = { enabled: true, groups: [], rules: [] };
let activeProjectId: string | null = null;
let settingsRevision = 0;
let activeApply: Promise<ApplyResult> | null = null;
let progress: ApplyProgress = { active: false, current: 0, total: 0, phase: "idle" };

export function setSettings(_sdk: SDK, next: Settings): void {
  settings = normalizeSettings(next);
  settingsRevision += 1;
}

export function setActiveProject(projectId: string | null): void {
  if (projectId === activeProjectId) return;
  activeProjectId = projectId;
  settingsRevision += 1;
  progress = { active: false, current: 0, total: 0, phase: "idle" };
}

export async function recolorize(sdk: SDK): Promise<ApplyResult> {
  const snapshot: ApplySnapshot = {
    enabled: settings.enabled,
    projectId: activeProjectId,
    groups: settings.groups.map((group) => ({ ...group })),
    rules: settings.rules.map((rule) => ({ ...rule })),
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

function cancelledResult(
  cleared = 0,
  errors: string[] = [],
  colored = 0,
): ApplyResult {
  return { colored, cleared, errors: errors.slice(0, 20), cancelled: true };
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

export async function onInterceptResponse(
  sdk: SDK,
  request: any,
  response: any,
): Promise<void> {
  if (!settings.enabled) return;
  const match = firstMatchingRule(sdk, request, response);
  if (!match) return;
  try {
    const requestId = String(request.getId());
    const metadata = await getMetadataWithRetry(sdk, requestId);
    if (!metadata) throw new Error(`Request ${requestId} does not have metadata.`);
    if (!colorsEqual(metadata.color, match.color)) {
      const result = await setRequestColors(sdk, [{ requestId, metadataId: metadata.id, color: match.color }]);
      if (result.failures.length) throw new Error(result.failures[0]?.error ?? "Failed to set request color.");
    }
    if (activeProjectId) {
      await rememberColoredRequest(sdk, activeProjectId, request.getId());
    }
  } catch (error) {
    sdk.console.error(
      `[HTTPQL Colorizer] Failed to color request ${request.getId()}`,
      error,
    );
  }
}

function normalizeSettings(input: Settings): Settings {
  const groups = Array.isArray(input?.groups)
    ? input.groups.map((group) => ({
        id: String(group.id),
        name: String(group.name ?? "Group"),
      }))
    : [];
  const groupIds = new Set(groups.map((group) => group.id));
  return {
    enabled: Boolean(input?.enabled),
    groups,
    rules: Array.isArray(input?.rules)
      ? input.rules.map((rule) => ({
          id: String(rule.id),
          name: String(rule.name ?? "Rule"),
          httpql: String(rule.httpql ?? "").trim(),
          color: normalizeHex(rule.color),
          enabled: Boolean(rule.enabled),
          groupId: rule.groupId && groupIds.has(String(rule.groupId))
            ? String(rule.groupId)
            : null,
        }))
      : [],
  };
}

function normalizeHex(value: string): string {
  const candidate = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(candidate)
    ? candidate.toUpperCase()
    : "#185A6C";
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

async function getMetadata(
  sdk: SDK,
  requestId: string,
): Promise<RequestMetadata | null> {
  const result = await sdk.graphql.execute<{
    request?: { metadata?: { id?: string | null; color?: string | null } | null } | null;
  }>(metadataQuery, { id: requestId });
  if (result.errors?.length)
    throw new Error(result.errors.map((error) => error.message).join("; "));
  const metadata = result.data?.request?.metadata;
  return metadata?.id
    ? { id: metadata.id, color: metadata.color ?? null }
    : null;
}

async function getMetadataWithRetry(
  sdk: SDK,
  requestId: string,
): Promise<RequestMetadata | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const metadata = await getMetadata(sdk, requestId);
      if (metadata) return metadata;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 5) {
      await new Promise<void>((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  if (lastError) throw lastError;
  return null;
}

function colorsEqual(current: string | null, desired: string): boolean {
  return String(current ?? "").toUpperCase() === desired.toUpperCase();
}

async function setRequestColors(
  sdk: SDK,
  updates: ColorUpdate[],
): Promise<ColorUpdateResult> {
  const batches: ColorUpdate[][] = [];
  for (let start = 0; start < updates.length; start += MUTATION_BATCH_SIZE) {
    batches.push(updates.slice(start, start + MUTATION_BATCH_SIZE));
  }

  const batchResults = await mapWithConcurrency(
    batches,
    async (batch) => {
      const failures: ColorFailure[] = [];
      const variables: Record<string, unknown> = {};
      const definitions = batch.map((update, index) => {
        variables[`metadataId${index}`] = update.metadataId;
        variables[`input${index}`] = { color: update.color };
        return `$metadataId${index}: ID!, $input${index}: UpdateRequestMetadataInput!`;
      });
      const mutations = batch.map((_, index) => `update_${index}: updateRequestMetadata(id: $metadataId${index}, input: $input${index}) { metadata { id color } }`).join("\n");
      const mutation = `mutation BatchUpdate(${definitions.join(", ")}) { ${mutations} }`;
      try {
        const result = await sdk.graphql.execute<Record<string, unknown>>(mutation, variables);
        const graphQLError = result.errors?.map((error) => error.message).join("; ");
        batch.forEach((update, index) => {
          if (graphQLError || !result.data?.[`update_${index}`]) {
            failures.push({ requestId: update.requestId, error: graphQLError ?? "Caido returned no update result." });
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        batch.forEach((update) => failures.push({ requestId: update.requestId, error: message }));
      }
      return failures;
    },
    MUTATION_CONCURRENCY,
  );
  return {
    failures: batchResults.flat(),
  };
}

async function executeColorActions(
  sdk: SDK,
  actions: ColorAction[],
  isCancelled: () => boolean,
): Promise<ActionExecutionResult> {
  const batches: ColorAction[][] = [];
  for (let start = 0; start < actions.length; start += MUTATION_BATCH_SIZE) {
    batches.push(actions.slice(start, start + MUTATION_BATCH_SIZE));
  }
  const results = await mapWithConcurrency(
    batches,
    async (batch) => {
      if (isCancelled()) {
        return {
          failures: [] as ColorFailure[],
          skipped: batch.map((action) => action.requestId),
          successful: [] as string[],
        };
      }
      const resolved = await Promise.all(batch.map(async (action) => {
        try {
          const metadata = await getMetadata(sdk, action.requestId);
          if (!metadata)
            throw new Error(`Request ${action.requestId} does not have metadata.`);
          if (colorsEqual(metadata.color, action.color)) {
            return { unchangedId: action.requestId };
          }
          return {
            update: { requestId: action.requestId, metadataId: metadata.id, color: action.color },
          };
        } catch (error) {
          const prefix = action.ruleName ? `Rule "${action.ruleName}" / ` : "";
          return {
            failure: {
              requestId: action.requestId,
              error: `${prefix}request ${action.requestId}: ${error instanceof Error ? error.message : String(error)}`,
            },
          };
        }
      }));
      if (isCancelled()) {
        return {
          failures: [] as ColorFailure[],
          skipped: batch.map((action) => action.requestId),
          successful: [] as string[],
        };
      }
      const updates = resolved.flatMap((item) => item.update ? [item.update] : []);
      const metadataFailures = resolved.flatMap((item) => item.failure ? [item.failure] : []);
      const unchangedIds = resolved.flatMap((item) => item.unchangedId ? [item.unchangedId] : []);
      const updateResult = await setRequestColors(sdk, updates);
      const failedIds = new Set(updateResult.failures.map((failure) => failure.requestId));
      progress.current += batch.length;
      return {
        failures: [...metadataFailures, ...updateResult.failures],
        skipped: [],
        successful: [
          ...unchangedIds,
          ...updates
            .filter((update) => !failedIds.has(update.requestId))
            .map((update) => update.requestId),
        ],
      };
    },
    MUTATION_CONCURRENCY,
  );
  return {
    failures: results.flatMap((result) => result.failures),
    skipped: results.flatMap((result) => result.skipped),
    successful: results.flatMap((result) => result.successful),
  };
}

async function reconcileOwnership(
  sdk: SDK,
  projectId: string,
  ownedIds: Set<string>,
  desiredIds: Set<string>,
  staleIds: Set<string>,
  successfulIds: Set<string>,
): Promise<string[]> {
  const errors: string[] = [];
  await forgetColoredRequests(
    sdk,
    projectId,
    [...staleIds].filter((id) => successfulIds.has(id)),
  );
  const newlyColoredIds = [...desiredIds].filter(
    (id) => successfulIds.has(id) && !ownedIds.has(id),
  );
  try {
    await rememberColoredRequests(sdk, projectId, newlyColoredIds);
  } catch (error) {
    errors.push(
      `Failed to save color ownership: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return errors;
}

async function reapplyExistingHistory(
  sdk: SDK,
  snapshot: ApplySnapshot,
  isCancelled: () => boolean,
): Promise<ApplyResult> {
  if (!snapshot.projectId) return { colored: 0, cleared: 0, errors: [] };
  const projectId = snapshot.projectId;
  progress = { active: true, current: 0, total: 0, phase: "finding" };
  try {
    const ownedIds = new Set(await ownedRequestIds(sdk, projectId));
    if (isCancelled()) return cancelledResult();
    const desired = new Map<string, ColorAction>();
    const errors: string[] = [];
    if (snapshot.enabled) {
      for (const rule of snapshot.rules) {
        if (!rule.enabled || !rule.httpql) continue;
        let cursor: string | null = null;
        while (true) {
          try {
            let query = sdk.requests
              .query()
              .filter(rule.httpql)
              // Caido displays the newest history entries at the top. Query in
              // the same order so visible rows are recolored from top to bottom.
              .descending("req", "created_at")
              .first(PAGE_SIZE);
            if (cursor) query = query.after(cursor);
            const page = await query.execute();
            if (isCancelled()) return cancelledResult(0, errors);
            for (const item of page.items) {
              const requestId = String(item.request.getId());
              if (!desired.has(requestId)) {
                desired.set(requestId, {
                  requestId,
                  color: rule.color,
                  ruleName: rule.name,
                });
              }
            }
            if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) break;
            cursor = page.pageInfo.endCursor;
          } catch (error) {
            errors.push(
              `Rule "${rule.name}": ${error instanceof Error ? error.message : String(error)}`,
            );
            break;
          }
        }
      }
    }
    const desiredIds = new Set(desired.keys());
    const staleIds = new Set([...ownedIds].filter((id) => !desiredIds.has(id)));
    const actions: ColorAction[] = [
      ...desired.values(),
      ...[...staleIds].map((requestId) => ({ requestId, color: "" })),
    ];
    progress = { active: true, current: 0, total: actions.length, phase: "applying" };
    const actionResult = await executeColorActions(sdk, actions, isCancelled);
    const successfulIds = new Set(actionResult.successful);
    errors.push(...actionResult.failures.map((failure) => failure.error));
    errors.push(...await reconcileOwnership(sdk, projectId, ownedIds, desiredIds, staleIds, successfulIds));
    const colored = [...desiredIds].filter((id) => successfulIds.has(id)).length;
    const cleared = [...staleIds].filter((id) => successfulIds.has(id)).length;
    if (isCancelled()) return cancelledResult(cleared, errors, colored);
    return {
      colored,
      cleared,
      errors: errors.slice(0, 20),
    };
  } finally {
    progress = { active: false, current: progress.total, total: progress.total, phase: "idle" };
  }
}
