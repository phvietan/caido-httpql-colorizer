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
import { forgetAllOwned, ownedRequestIds, rememberColoredRequest } from "./db";

const metadataQuery = `query getRequestMetadata($id: ID!) { request(id: $id) { metadata { id } } }`;
const PAGE_SIZE = 500;
const MUTATION_BATCH_SIZE = 20;
const MUTATION_CONCURRENCY = 10;

type ColorUpdate = { requestId: string; metadataId: string; color: string };
let settings: Settings = { enabled: true, rules: [] };
let applyingExisting = false;
let progress: ApplyProgress = { active: false, current: 0, total: 0, phase: "idle" };

export async function setSettings(
  sdk: SDK,
  next: Settings,
): Promise<ApplyResult> {
  settings = normalizeSettings(next);
  return reapplyExistingHistory(sdk);
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
    const metadataId = await getMetadataId(sdk, requestId);
    if (!metadataId) throw new Error(`Request ${requestId} does not have metadata.`);
    const failures = await setRequestColors(sdk, [{ requestId, metadataId, color: match.color }]);
    if (failures.length) throw new Error(failures[0]?.error ?? "Failed to set request color.");
    await rememberColoredRequest(sdk, request.getId());
  } catch (error) {
    sdk.console.error(
      `[HTTPQL Colorizer] Failed to color request ${request.getId()}`,
      error,
    );
  }
}

function normalizeSettings(input: Settings): Settings {
  return {
    enabled: Boolean(input?.enabled),
    rules: Array.isArray(input?.rules)
      ? input.rules.map((rule) => ({
          id: String(rule.id),
          name: String(rule.name ?? "Rule"),
          httpql: String(rule.httpql ?? "").trim(),
          color: normalizeHex(rule.color),
          enabled: Boolean(rule.enabled),
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

async function getMetadataId(
  sdk: SDK,
  requestId: string,
): Promise<string | null> {
  const result = await sdk.graphql.execute<{
    request?: { metadata?: { id?: string | null } | null } | null;
  }>(metadataQuery, { id: requestId });
  if (result.errors?.length)
    throw new Error(result.errors.map((error) => error.message).join("; "));
  return result.data?.request?.metadata?.id ?? null;
}

async function setRequestColors(sdk: SDK, updates: ColorUpdate[]) {
  const batches: ColorUpdate[][] = [];
  for (let start = 0; start < updates.length; start += MUTATION_BATCH_SIZE) {
    batches.push(updates.slice(start, start + MUTATION_BATCH_SIZE));
  }

  const batchFailures = await mapWithConcurrency(
    batches,
    async (batch) => {
      const failures: Array<{ requestId: string; error: string }> = [];
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
  return batchFailures.flat();
}

async function clearOwnedColors(
  sdk: SDK,
): Promise<{ cleared: number; errors: string[] }> {
  const errors: string[] = [];
  let cleared = 0;
  const updates: ColorUpdate[] = [];
  for (const id of await ownedRequestIds(sdk)) {
    try {
      const metadataId = await getMetadataId(sdk, id);
      if (!metadataId) throw new Error(`Request ${id} does not have metadata.`);
      updates.push({ requestId: id, metadataId, color: "" });
    } catch (error) {
      errors.push(
        `Could not clear ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const failures = await setRequestColors(sdk, updates);
  cleared = updates.length - failures.length;
  for (const failure of failures) {
    errors.push(`Could not clear ${failure.requestId}: ${failure.error}`);
  }
  await forgetAllOwned(sdk);
  return { cleared, errors };
}

async function reapplyExistingHistory(sdk: SDK): Promise<ApplyResult> {
  if (applyingExisting)
    return {
      colored: 0,
      cleared: 0,
      errors: ["A history re-apply is already running."],
    };
  applyingExisting = true;
  progress = { active: true, current: 0, total: 0, phase: "clearing" };
  try {
    const clearResult = await clearOwnedColors(sdk);
    if (!settings.enabled)
      return {
        colored: 0,
        cleared: clearResult.cleared,
        errors: clearResult.errors,
      };
    progress = { active: true, current: 0, total: 0, phase: "finding" };
    const claimed = new Set<string>();
    const pending: Array<{ requestId: string; rule: ColorRule }> = [];
    const errors = [...clearResult.errors];
    let colored = 0;
    for (const rule of settings.rules) {
      if (!rule.enabled || !rule.httpql) continue;
      let cursor: string | null = null;
      while (true) {
        try {
          let query = sdk.requests
            .query()
            .filter(rule.httpql)
            .ascending("req", "created_at")
            .first(PAGE_SIZE);
          if (cursor) query = query.after(cursor);
          const page = await query.execute();
          for (const item of page.items) {
            const id = String(item.request.getId());
            if (claimed.has(id)) continue;
            claimed.add(id);
            pending.push({ requestId: id, rule });
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
    progress = { active: true, current: 0, total: pending.length, phase: "applying" };
    for (let start = 0; start < pending.length; start += MUTATION_BATCH_SIZE) {
      const pendingBatch = pending.slice(start, start + MUTATION_BATCH_SIZE);
      const updates: ColorUpdate[] = [];
      for (const item of pendingBatch) {
        try {
          const metadataId = await getMetadataId(sdk, item.requestId);
          if (!metadataId) throw new Error(`Request ${item.requestId} does not have metadata.`);
          updates.push({ requestId: item.requestId, metadataId, color: item.rule.color });
        } catch (error) {
          errors.push(`Rule "${item.rule.name}" / request ${item.requestId}: ${error instanceof Error ? error.message : String(error)}`);
          progress.current += 1;
        }
      }
      const failures = await setRequestColors(sdk, updates);
      const failedIds = new Set(failures.map((failure) => failure.requestId));
      for (const update of updates) {
        if (!failedIds.has(update.requestId)) {
          try {
            await rememberColoredRequest(sdk, update.requestId);
            colored += 1;
          } catch (error) {
            errors.push(`Request ${update.requestId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        progress.current += 1;
      }
      for (const failure of failures) {
        errors.push(`Request ${failure.requestId}: ${failure.error}`);
      }
    }
    return {
      colored,
      cleared: clearResult.cleared,
      errors: errors.slice(0, 20),
    };
  } finally {
    applyingExisting = false;
    progress = { active: false, current: progress.total, total: progress.total, phase: "idle" };
  }
}
