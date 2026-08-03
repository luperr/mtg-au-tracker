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

  await Promise.all(Array.from({ length: workerCount(limit, items.length) }, worker));

  return results;
}

/**
 * Number of workers to run for `limit` concurrency over `itemCount` items.
 *
 * Guards against a NaN limit (a malformed env var reaches here as NaN, and
 * `Array.from({ length: NaN })` yields *zero* workers — so the pool silently
 * processes nothing and reports success).
 */
function workerCount(limit: number, itemCount: number): number {
  const safe = Number.isFinite(limit) ? Math.floor(limit) : 1;
  return Math.max(1, Math.min(safe, itemCount));
}

/**
 * Like mapWithConcurrency, but yields results as they complete instead of
 * collecting them all first.
 *
 * Use when the result set is too large to hold in memory at once. Keeps `limit`
 * calls in flight continuously — no batch barrier, so one slow item doesn't
 * stall the workers behind it — while applying backpressure once `limit * 2`
 * finished results are waiting to be consumed.
 *
 * Results arrive in completion order, not input order. Rejects on the first
 * failure; in-flight work is awaited before the error propagates.
 */
export async function* mapConcurrentStream<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): AsyncGenerator<R> {
  const workers = workerCount(limit, items.length);
  const maxBuffered = workers * 2;

  const ready: R[] = [];
  const spaceWaiters: (() => void)[] = [];
  let next = 0;
  let failure: unknown = null;
  let stopped = false;
  let wakeConsumer: (() => void) | null = null;

  const signalConsumer = (): void => {
    const wake = wakeConsumer;
    wakeConsumer = null;
    wake?.();
  };

  const releaseWaiters = (): void => {
    while (spaceWaiters.length > 0) spaceWaiters.shift()?.();
  };

  const worker = async (): Promise<void> => {
    while (failure === null && !stopped) {
      const index = next++;
      if (index >= items.length) return;

      try {
        ready.push(await fn(items[index], index));
      } catch (err) {
        failure ??= err;
      }
      signalConsumer();

      while (ready.length >= maxBuffered && failure === null && !stopped) {
        await new Promise<void>((resolve) => spaceWaiters.push(resolve));
      }
    }
  };

  let producersDone = false;
  const producers = Promise.all(Array.from({ length: workers }, worker)).finally(() => {
    producersDone = true;
    signalConsumer();
  });

  try {
    while (true) {
      if (ready.length > 0) {
        yield ready.shift() as R;
        // A slot freed up — release every parked worker and let them re-check.
        releaseWaiters();
        continue;
      }
      if (failure !== null || producersDone) break;
      await new Promise<void>((resolve) => {
        wakeConsumer = resolve;
      });
    }
  } finally {
    // Tell the workers to stop pulling new items and unpark any that are
    // parked on backpressure, so the pool settles instead of running the rest
    // of the list to completion when the consumer abandons us early.
    stopped = true;
    releaseWaiters();
    await producers;
  }

  if (failure !== null) throw failure;
}
