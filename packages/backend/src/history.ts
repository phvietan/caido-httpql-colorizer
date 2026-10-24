/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";
import type { Settings, ApplyResult, ApplyProgress } from "shared";
import { mapWithConcurrency, colorsEqual, cancelledResult } from "shared";
import {
  forgetColoredRequests,
  ownedRequestIds,
  rememberColoredRequests,
} from "./db";
import {
  getMetadata,
  setRequestColors,
  MUTATION_BATCH_SIZE,
  MUTATION_CONCURRENCY,
} from "./metadata";
import type { ColorFailure, ColorUpdateResult } from "./metadata";

const PAGE_SIZE = 500;
type ActionExecutionResult = ColorUpdateResult & {
  skipped: string[];
  successful: string[];
};
export type ApplySnapshot = Settings & { projectId: string | null };
type ColorAction = { requestId: string; color: string; ruleName?: string };
export let progress: ApplyProgress = {
  active: false,
  current: 0,
  total: 0,
  phase: "idle",
};

export function resetProgress(): void {
  progress = { active: false, current: 0, total: 0, phase: "idle" };
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
      const resolved = await Promise.all(
        batch.map(async (action) => {
          try {
            const metadata = await getMetadata(sdk, action.requestId);
            if (!metadata)
              throw new Error(
                `Request ${action.requestId} does not have metadata.`,
              );
            if (colorsEqual(metadata.color, action.color)) {
              return { unchangedId: action.requestId };
            }
            return {
              update: {
                requestId: action.requestId,
                metadataId: metadata.id,
                color: action.color,
              },
            };
          } catch (error) {
            const prefix = action.ruleName
              ? `Rule "${action.ruleName}" / `
              : "";
            return {
              failure: {
                requestId: action.requestId,
                error: `${prefix}request ${action.requestId}: ${error instanceof Error ? error.message : String(error)}`,
              },
            };
          }
        }),
      );
      if (isCancelled()) {
        return {
          failures: [] as ColorFailure[],
          skipped: batch.map((action) => action.requestId),
          successful: [] as string[],
        };
      }
      const updates = resolved.flatMap((item) =>
        item.update ? [item.update] : [],
      );
      const metadataFailures = resolved.flatMap((item) =>
        item.failure ? [item.failure] : [],
      );
      const unchangedIds = resolved.flatMap((item) =>
        item.unchangedId ? [item.unchangedId] : [],
      );
      const updateResult = await setRequestColors(sdk, updates);
      const failedIds = new Set(
        updateResult.failures.map((failure) => failure.requestId),
      );
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

export async function reapplyExistingHistory(
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

    const desiredIds = new Set(desired.keys());
    const staleIds = new Set([...ownedIds].filter((id) => !desiredIds.has(id)));
    const actions: ColorAction[] = [
      ...desired.values(),
      ...[...staleIds].map((requestId) => ({ requestId, color: "" })),
    ];
    progress = {
      active: true,
      current: 0,
      total: actions.length,
      phase: "applying",
    };
    const actionResult = await executeColorActions(sdk, actions, isCancelled);
    const successfulIds = new Set(actionResult.successful);
    errors.push(...actionResult.failures.map((failure) => failure.error));
    errors.push(
      ...(await reconcileOwnership(
        sdk,
        projectId,
        ownedIds,
        desiredIds,
        staleIds,
        successfulIds,
      )),
    );
    const colored = [...desiredIds].filter((id) =>
      successfulIds.has(id),
    ).length;
    const cleared = [...staleIds].filter((id) => successfulIds.has(id)).length;
    if (isCancelled()) return cancelledResult(cleared, errors, colored);
    return {
      colored,
      cleared,
      errors: errors.slice(0, 20),
    };
  } finally {
    progress = {
      active: false,
      current: progress.total,
      total: progress.total,
      phase: "idle",
    };
  }
}
