/**
 * Shared scraper utilities.
 */

/** Today's date as "YYYY-MM-DD" string. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calculate and format a match rate percentage.
 * Returns "0" if total is 0.
 */
export function matchRate(matched: number, total: number): number {
  if (total === 0) return 0;
  return parseFloat(((matched / total) * 100).toFixed(1));
}

/**
 * Run `fn` over `items` with at most `limit` calls in flight, returning results
 * in input order.
 *
 * A worker pool rather than fixed batches: workers pull the next item as soon as
 * they're free, so one slow item doesn't stall the others behind it.
 *
 * Rejects on the first failure (like Promise.all). Callers that need per-item
 * error isolation should catch inside `fn`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };

  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));

  return results;
}
