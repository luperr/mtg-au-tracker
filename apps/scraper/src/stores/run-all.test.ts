import { describe, it, expect, vi } from "vitest";
import type { ScrapedCard } from "@mtg-au/shared";

// runStore writes through db.transaction. Stub it with a tx whose delete and
// insert chains resolve, so the test exercises the health classification
// without a database.
vi.mock("../lib/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/db.js")>();
  const chain = {
    where: async () => undefined,
    values: () => ({ onConflictDoNothing: async () => undefined, then: (r: (v: unknown) => void) => r(undefined) }),
  };
  const tx = { delete: () => chain, insert: () => chain };
  return { ...actual, db: { transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx) } };
});

const { runStore } = await import("./run-all.js");

function card(i: number): ScrapedCard {
  return {
    rawName: `Card ${i}`,
    setCode: null,
    setName: null,
    collectorNumber: null,
    price: "1.00",
    priceType: "sell",
    condition: "NM",
    isFoil: false,
    inStock: true,
    sourceUrl: `https://example.test/${i}`,
  };
}

function scraperOf(n: number) {
  return {
    async *scrapeAll() {
      for (let i = 0; i < n; i++) yield card(i);
    },
  };
}

// Matches the first `hits` listings and leaves the rest unmatched.
function matcherHitting(hits: number) {
  let seen = 0;
  return {
    match: () =>
      seen++ < hits
        ? { printingId: "p1", matchType: "exact", confidence: 1 }
        : { printingId: null, matchType: "unmatched", confidence: 0 },
  };
}

describe("runStore health", () => {
  it("flags a store that matches 1 of 100 listings as low_match_rate", async () => {
    const health = await runStore(
      "test_store",
      scraperOf(100) as never,
      matcherHitting(1) as never,
    );
    expect(health.issue).toBe("low_match_rate");
  });

  it("reports ok for a store that matches 95 of 100 listings", async () => {
    const health = await runStore(
      "test_store",
      scraperOf(100) as never,
      matcherHitting(95) as never,
    );
    expect(health.issue).toBe("ok");
  });
});
