/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";

const TABLE = "httpql_colorizer_owned";

export async function ensureDatabase(sdk: SDK): Promise<void> {
  const db = await sdk.meta.db();
  await db.exec(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (request_id TEXT PRIMARY KEY);`,
  );
}

export async function rememberColoredRequest(
  sdk: SDK,
  requestId: string,
): Promise<void> {
  await ensureDatabase(sdk);
  const db = await sdk.meta.db();
  const statement = await db.prepare(
    `INSERT OR IGNORE INTO ${TABLE}(request_id) VALUES (?)`,
  );
  await statement.run(String(requestId));
}

export async function ownedRequestIds(sdk: SDK): Promise<string[]> {
  await ensureDatabase(sdk);
  const db = await sdk.meta.db();
  const statement = await db.prepare(`SELECT request_id FROM ${TABLE}`);
  const rows = (await statement.all()) as Array<{ request_id: string }>;
  return rows.map((row) => String(row.request_id));
}

export async function forgetColoredRequests(
  sdk: SDK,
  requestIds: readonly string[],
): Promise<void> {
  if (requestIds.length === 0) return;
  await ensureDatabase(sdk);
  const db = await sdk.meta.db();
  const statement = await db.prepare(
    `DELETE FROM ${TABLE} WHERE request_id = ?`,
  );
  for (const requestId of requestIds) {
    await statement.run(String(requestId));
  }
}
