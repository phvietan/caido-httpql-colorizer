/** Map items concurrently while preserving the input order in the result. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R> | R,
  concurrency: number,
): Promise<R[]> {
  if (concurrency < 1 || !Number.isFinite(concurrency)) {
    throw new Error("Concurrency must be at least 1.");
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index] as T, index);
    }
  }

  const workerCount = Math.min(Math.floor(concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
