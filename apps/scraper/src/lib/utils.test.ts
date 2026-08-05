import { describe, it, expect, vi, afterEach } from "vitest";
import { todayISO, matchRate, mapWithConcurrency, mapConcurrentStream } from "./utils.js";

describe("todayISO", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a YYYY-MM-DD string", () => {
    const result = todayISO();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the correct date for a known timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T10:30:00Z"));
    expect(todayISO()).toBe("2026-04-13");
  });

  it("handles midnight UTC edge case", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(todayISO()).toBe("2026-01-01");
  });
});

describe("matchRate", () => {
  it("returns 0 when total is 0", () => {
    expect(matchRate(0, 0)).toBe(0);
  });

  it("returns 100 for a perfect match", () => {
    expect(matchRate(50, 50)).toBe(100);
  });

  it("returns 0 when nothing matched", () => {
    expect(matchRate(0, 100)).toBe(0);
  });

  it("rounds to one decimal place", () => {
    expect(matchRate(1, 3)).toBe(33.3);
    expect(matchRate(2, 3)).toBe(66.7);
  });

  it("handles typical scraper values", () => {
    expect(matchRate(4500, 5000)).toBe(90);
    expect(matchRate(142, 150)).toBe(94.7);
  });
});

describe("mapWithConcurrency", () => {
  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("returns results in input order regardless of completion order", async () => {
    // Reverse the delays so completion order is the opposite of input order.
    const items = [1, 2, 3, 4, 5];
    const result = await mapWithConcurrency(items, 3, async (n) => {
      await tick((6 - n) * 10);
      return n * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(5);
      inFlight--;
    });

    expect(peak).toBe(3);
  });

  it("pulls the next item as soon as a worker frees up, rather than waiting for a batch", async () => {
    // One slow item alongside many fast ones. With fixed batching the fast
    // items behind the slow one would be blocked; a pool keeps working.
    const order: number[] = [];
    await mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (n) => {
      await tick(n === 0 ? 60 : 5);
      order.push(n);
    });

    // The slow first item must finish last despite starting first.
    expect(order[order.length - 1]).toBe(0);
  });

  it("propagates the first rejection", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });

  it("handles an empty input without running anything", async () => {
    const fn = vi.fn();
    await expect(mapWithConcurrency([], 3, fn)).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("caps workers at the item count when the limit is larger", async () => {
    let peak = 0;
    let inFlight = 0;
    await mapWithConcurrency([1, 2], 10, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(5);
      inFlight--;
    });
    expect(peak).toBe(2);
  });

  // A malformed env var (CC_CONCURRENCY="three") reaches the pool as NaN.
  // Array.from({ length: NaN }) builds zero workers, so the pool would quietly
  // process nothing and report success — after prices had been deleted.
  it("still runs every item when the limit is NaN", async () => {
    const result = await mapWithConcurrency([1, 2, 3], Number.NaN, async (n) => n * 2);
    expect(result).toEqual([2, 4, 6]);
  });
});

describe("mapConcurrentStream", () => {
  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of gen) out.push(item);
    return out;
  }

  it("yields every result", async () => {
    const result = await collect(mapConcurrentStream([1, 2, 3, 4], 2, async (n) => n * 2));
    expect(result.sort((a, b) => a - b)).toEqual([2, 4, 6, 8]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;

    await collect(
      mapConcurrentStream(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await tick(5);
        inFlight--;
      }),
    );

    expect(peak).toBe(3);
  });

  // The whole point of streaming over chunking: a slow item must not stop the
  // workers beside it from starting the next ones.
  it("keeps workers busy past a slow item instead of waiting for a batch", async () => {
    const started: number[] = [];
    await collect(
      mapConcurrentStream([0, 1, 2, 3, 4, 5], 2, async (n) => {
        started.push(n);
        await tick(n === 0 ? 80 : 5);
        return n;
      }),
    );

    // With fixed chunks of 2, item 4 could only start after items 0 and 1 both
    // finished. Pooling starts it while the slow item 0 is still running.
    expect(started).toContain(4);
    expect(started.indexOf(4)).toBeLessThan(started.length);
    expect(started.length).toBe(6);
  });

  it("applies backpressure rather than buffering the whole list", async () => {
    let produced = 0;
    const gen = mapConcurrentStream(Array.from({ length: 50 }, (_, i) => i), 2, async (n) => {
      produced++;
      return n;
    });

    // Pull a single result, then let the pool run as far as it will.
    await gen.next();
    await tick(50);

    // Bounded at limit * 2 buffered plus what's in flight and consumed —
    // nowhere near all 50.
    expect(produced).toBeLessThan(10);
    await gen.return(undefined as never);
  });

  it("propagates the first rejection", async () => {
    await expect(
      collect(
        mapConcurrentStream([1, 2, 3], 2, async (n) => {
          if (n === 2) throw new Error("boom");
          return n;
        }),
      ),
    ).rejects.toThrow("boom");
  });

  it("handles an empty input without running anything", async () => {
    const fn = vi.fn();
    await expect(collect(mapConcurrentStream([], 3, fn))).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("stops pulling new items when the consumer breaks out early", async () => {
    let called = 0;
    const gen = mapConcurrentStream(Array.from({ length: 50 }, (_, i) => i), 2, async (n) => {
      called++;
      await tick(2);
      return n;
    });

    for await (const _ of gen) break;
    await tick(40);

    expect(called).toBeLessThan(10);
  });

  it("still runs every item when the limit is NaN", async () => {
    const result = await collect(mapConcurrentStream([1, 2, 3], Number.NaN, async (n) => n * 2));
    expect(result.sort((a, b) => a - b)).toEqual([2, 4, 6]);
  });
});
