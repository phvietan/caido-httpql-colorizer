/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";
import { mapWithConcurrency } from "shared";

const metadataQuery = `query getRequestMetadata($id: ID!) { request(id: $id) { metadata { id color } } }`;
export const MUTATION_BATCH_SIZE = 50;
export const MUTATION_CONCURRENCY = 10;

export type ColorUpdate = {
  requestId: string;
  metadataId: string;
  color: string;
};
export type RequestMetadata = { id: string; color: string | null };
export type ColorFailure = { requestId: string; error: string };
export type ColorUpdateResult = { failures: ColorFailure[] };

export async function getMetadata(
  sdk: SDK,
  requestId: string,
): Promise<RequestMetadata | null> {
  const result = await sdk.graphql.execute<{
    request?: {
      metadata?: { id?: string | null; color?: string | null } | null;
    } | null;
  }>(metadataQuery, { id: requestId });
  if (result.errors?.length)
    throw new Error(result.errors.map((error) => error.message).join("; "));
  const metadata = result.data?.request?.metadata;
  return metadata?.id
    ? { id: metadata.id, color: metadata.color ?? null }
    : null;
}

export async function getMetadataWithRetry(
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
      await new Promise<void>((resolve) =>
        setTimeout(resolve, 50 * (attempt + 1)),
      );
    }
  }
  if (lastError) throw lastError;
  return null;
}

export async function setRequestColors(
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
      const mutations = batch
        .map(
          (_, index) =>
            `update_${index}: updateRequestMetadata(id: $metadataId${index}, input: $input${index}) { metadata { id color } }`,
        )
        .join("\n");
      const mutation = `mutation BatchUpdate(${definitions.join(", ")}) { ${mutations} }`;
      try {
        const result = await sdk.graphql.execute<Record<string, unknown>>(
          mutation,
          variables,
        );
        const graphQLError = result.errors
          ?.map((error) => error.message)
          .join("; ");
        batch.forEach((update, index) => {
          if (graphQLError || !result.data?.[`update_${index}`]) {
            failures.push({
              requestId: update.requestId,
              error: graphQLError ?? "Caido returned no update result.",
            });
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        batch.forEach((update) =>
          failures.push({ requestId: update.requestId, error: message }),
        );
      }
      return failures;
    },
    MUTATION_CONCURRENCY,
  );
  return {
    failures: batchResults.flat(),
  };
}
