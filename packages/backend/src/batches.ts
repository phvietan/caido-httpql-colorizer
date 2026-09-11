export const MAX_BATCH_ITEMS = 1_000;

export async function forEachBatch<T>(
  items: readonly T[],
  operation: (batch: readonly T[]) => Promise<void>,
  maxItems = MAX_BATCH_ITEMS,
): Promise<void> {
  const batchSize = Math.min(Math.max(1, maxItems), MAX_BATCH_ITEMS);
  for (let start = 0; start < items.length; start += batchSize) {
    await operation(items.slice(start, start + batchSize));
  }
}
