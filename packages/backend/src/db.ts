/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";

const TABLE = "httpql_colorizer_owned_by_project";
const MAX_BATCH_ITEMS = 1_000;

export async function ensureDatabase(sdk: SDK): Promise<void> {
  const db = await sdk.meta.db();
  await db.exec(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (project_id TEXT NOT NULL, request_id TEXT NOT NULL, PRIMARY KEY(project_id, request_id));`,
  );
}

export async function rememberColoredRequests(
  sdk: SDK,
  projectId: string,
  requestIds: readonly string[],
): Promise<void> {
  if (requestIds.length === 0) return;
  const db = await sdk.meta.db();
  await forEachBatch(requestIds, async (batch) => {
    const values = batch.map(() => "(?, ?)").join(", ");
    const statement = await db.prepare(
      `INSERT OR IGNORE INTO ${TABLE}(project_id, request_id) VALUES ${values}`,
    );
    const params = batch.flatMap((requestId) => [
      String(projectId),
      String(requestId),
    ]);
    await statement.run(...params);
  });
}

export async function ownedRequestIds(
  sdk: SDK,
  projectId: string,
): Promise<string[]> {
  const db = await sdk.meta.db();
  const statement = await db.prepare(
    `SELECT request_id FROM ${TABLE} WHERE project_id = ?`,
  );
  const rows = (await statement.all(String(projectId))) as Array<{
    request_id: string;
  }>;
  return rows.map((row) => String(row.request_id));
}

export async function forgetColoredRequests(
  sdk: SDK,
  projectId: string,
  requestIds: readonly string[],
): Promise<void> {
  if (requestIds.length === 0) return;
  const db = await sdk.meta.db();
  await forEachBatch(requestIds, async (batch) => {
    const placeholders = batch.map(() => "?").join(", ");
    const statement = await db.prepare(
      `DELETE FROM ${TABLE} WHERE project_id = ? AND request_id IN (${placeholders})`,
    );
    await statement.run(String(projectId), ...batch.map(String));
  });
}

async function forEachBatch<T>(
  items: readonly T[],
  operation: (batch: readonly T[]) => Promise<void>,
  maxItems = MAX_BATCH_ITEMS,
): Promise<void> {
  const batchSize = Math.min(Math.max(1, maxItems), MAX_BATCH_ITEMS);
  for (let start = 0; start < items.length; start += batchSize) {
    await operation(items.slice(start, start + batchSize));
  }
}
