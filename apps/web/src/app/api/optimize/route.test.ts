import { describe, it, expect } from "vitest";
import { branchAndBound, evaluateSubset, localSearch, dedupeCheapestPerStore } from "./algorithm";
import type { OptimizeItem, Listing } from "./algorithm";

// ── Test fixtures ─────────────────────────────────────────────────────────────

function listing(storeId: string, priceAud: number, shippingAud: number | null = null): Listing {
  return {
    printingId: `printing-${storeId}`,
    storeId,
    storeName: storeId,
    priceAud,
    shippingAud,
    condition: "NM",
    url: null,
    setName: "Test Set",
    setCode: "tst",
    rarity: "common",
    isFoil: false,
    finish: "nonfoil",
    borderColor: null,
    frameEffects: [],
    imageUri: null,
  };
}

const items: OptimizeItem[] = [
  { cardId: "card-1", cardName: "Card One", printingId: "p1" },
  { cardId: "card-2", cardName: "Card Two", printingId: "p2" },
];

/** Run branchAndBound with the ctx built the same way route.ts builds it. */
function runBB(
  stores: string[],
  available: OptimizeItem[],
  byCard: Map<string, Listing[]>,
  allPoolStoreIds: Set<string>,
  flatRates: Record<string, number | null>,
  best: { cost: number; assignments: Map<string, Listing> | null },
  deadline = Infinity,
): boolean {
  return branchAndBound(
    {
      stores,
      available,
      byCard,
      allPoolStoreIds,
      flatRates,
      best,
      deadline,
      rank: new Map(stores.map((s, i) => [s, i])),
    },
    0,
    new Set<string>(),
  );
}

// ── evaluateSubset ────────────────────────────────────────────────────────────

describe("evaluateSubset", () => {
  it("returns null when a card has no available listing", () => {
    const byCard = new Map([
      ["card-1", [listing("store-a", 5)]],
      ["card-2", []], // unavailable
    ]);
    const result = evaluateSubset(
      items,
      byCard,
      new Set(["store-a"]),
      new Set(["store-a"]),
      { "store-a": 5 },
    );
    expect(result).toBeNull();
  });

  it("assigns cheapest listing when single pool store is active", () => {
    const byCard = new Map([
      ["card-1", [listing("store-a", 5), listing("store-b", 3)]],
      ["card-2", [listing("store-a", 8), listing("store-b", 10)]],
    ]);
    // Only store-a is active pool store
    const result = evaluateSubset(
      items,
      byCard,
      new Set(["store-a"]),
      new Set(["store-a", "store-b"]),
      { "store-a": 6, "store-b": 4 },
    );
    // store-b is excluded (not in active set and it's a pool store)
    // All cards must come from store-a. Flat fee = 6.
    // card-1: $5 + card-2: $8 + flat $6 = $19
    expect(result).not.toBeNull();
    expect(result!.cost).toBe(19);
    expect(result!.assignments.get("card-1")!.storeId).toBe("store-a");
  });

  it("includes per-listing shipping for non-pool stores (eBay)", () => {
    const ebayListing = listing("ebay_au", 10, 4);
    const byCard = new Map([
      ["card-1", [ebayListing]],
      ["card-2", [listing("ebay_au", 6, 3)]],
    ]);
    const result = evaluateSubset(
      items,
      byCard,
      new Set(), // no pool stores active
      new Set(["store-a"]), // pool stores are store-a only, ebay is not in pool
      { "store-a": 6 },
    );
    // eBay: card-1 $10 + $4 shipping + card-2 $6 + $3 shipping = $23
    expect(result).not.toBeNull();
    expect(result!.cost).toBe(23);
  });

  it("breaks tie on flat rate — prefers store with lower flat fee", () => {
    const byCard = new Map([
      ["card-1", [listing("cheap-store", 5), listing("expensive-store", 5)]],
      ["card-2", [listing("cheap-store", 8), listing("expensive-store", 8)]],
    ]);
    const result = evaluateSubset(
      items,
      byCard,
      new Set(["cheap-store", "expensive-store"]),
      new Set(["cheap-store", "expensive-store"]),
      { "cheap-store": 3, "expensive-store": 10 },
    );
    // Both have same card prices; should assign all to cheap-store
    expect(result).not.toBeNull();
    expect(result!.assignments.get("card-1")!.storeId).toBe("cheap-store");
    expect(result!.assignments.get("card-2")!.storeId).toBe("cheap-store");
    // card-1 $5 + card-2 $8 + flat $3 = $16
    expect(result!.cost).toBe(16);
  });

  it("treats suffix-open stores as open at $0 flat (lower bound semantics)", () => {
    const byCard = new Map([
      ["card-1", [listing("store-a", 5), listing("store-b", 3)]],
      ["card-2", [listing("store-a", 8), listing("store-b", 10)]],
    ]);
    const stores = ["store-a", "store-b"];
    const rank = new Map(stores.map((s, i) => [s, i]));
    // Nothing decided-open, both stores undecided (fromIdx 0) → both usable at $0 flat.
    const result = evaluateSubset(
      items,
      byCard,
      new Set(),
      new Set(stores),
      { "store-a": 5, "store-b": 12 },
      { rank, fromIdx: 0 },
    );
    // Optimistic: card-1 from store-b $3, card-2 from store-a $8, no flat fees = $11
    expect(result).not.toBeNull();
    expect(result!.cost).toBe(11);
  });
});

// ── localSearch ───────────────────────────────────────────────────────────────

describe("localSearch", () => {
  it("finds the multi-store solution from an infeasible empty start", () => {
    // card-1 only at store-a, card-2 only at store-b
    const byCard = new Map([
      ["card-1", [listing("store-a", 5)]],
      ["card-2", [listing("store-b", 8)]],
    ]);
    const result = localSearch(
      items,
      byCard,
      new Set(),
      ["store-a", "store-b"],
      new Set(["store-a", "store-b"]),
      { "store-a": 3, "store-b": 3 },
    );
    // Must open both: $5 + $3 flat + $8 + $3 flat = $19
    expect(result).not.toBeNull();
    expect(result!.cost).toBe(19);
    expect(result!.active).toEqual(new Set(["store-a", "store-b"]));
  });

  it("never returns worse than its starting point", () => {
    const byCard = new Map([
      ["card-1", [listing("store-a", 5), listing("store-b", 3)]],
      ["card-2", [listing("store-a", 8), listing("store-b", 10)]],
    ]);
    const allPool = new Set(["store-a", "store-b"]);
    const flatRates = { "store-a": 5, "store-b": 12 };

    const start = evaluateSubset(items, byCard, new Set(["store-a"]), allPool, flatRates)!;
    const result = localSearch(items, byCard, new Set(["store-a"]), ["store-a", "store-b"], allPool, flatRates);

    expect(result).not.toBeNull();
    expect(result!.cost).toBeLessThanOrEqual(start.cost);
    // store-a alone is in fact optimal here: $5 + $8 + flat $5 = $18
    expect(result!.cost).toBe(18);
  });

  it("returns null when no store subset can cover all cards", () => {
    const byCard = new Map([
      ["card-1", [listing("store-a", 5)]],
      ["card-2", []], // unavailable anywhere
    ]);
    const result = localSearch(
      items,
      byCard,
      new Set(),
      ["store-a"],
      new Set(["store-a"]),
      { "store-a": 5 },
    );
    expect(result).toBeNull();
  });

  it("returns the initial evaluation when the deadline has already passed", () => {
    const byCard = new Map([
      ["card-1", [listing("store-a", 5), listing("store-b", 3)]],
      ["card-2", [listing("store-a", 8), listing("store-b", 10)]],
    ]);
    const allPool = new Set(["store-a", "store-b"]);
    const flatRates = { "store-a": 5, "store-b": 12 };

    // store-b alone is feasible but not optimal ($3 + $10 + flat $12 = $25);
    // with an expired deadline no moves are explored, so it is returned as-is.
    const result = localSearch(items, byCard, new Set(["store-b"]), ["store-a", "store-b"], allPool, flatRates, 0);

    expect(result).not.toBeNull();
    expect(result!.cost).toBe(25);
    expect(result!.active).toEqual(new Set(["store-b"]));
  });
});

// ── dedupeCheapestPerStore ────────────────────────────────────────────────────

describe("dedupeCheapestPerStore", () => {
  it("keeps only the first (cheapest) listing per store, preserving order", () => {
    const input = [
      listing("store-a", 3),
      listing("store-b", 4),
      listing("store-a", 5),
      listing("store-b", 4.5),
      listing("store-a", 9),
    ];
    const out = dedupeCheapestPerStore(input);
    expect(out).toHaveLength(2);
    expect(out[0].storeId).toBe("store-a");
    expect(out[0].priceAud).toBe(3);
    expect(out[1].storeId).toBe("store-b");
    expect(out[1].priceAud).toBe(4);
  });

  it("preserves the brute-force optimum on randomized instances", () => {
    for (const seed of [3, 99]) {
      const rng = makeRng(seed);
      const inst = randomInstance(rng, 5, 8);

      // Inflate: add 1–3 extra (more expensive or equal) listings per card/store
      const inflated = new Map<string, Listing[]>();
      for (const [cardId, listings] of inst.byCard) {
        const extra: Listing[] = [];
        for (const l of listings) {
          const copies = 1 + Math.floor(rng() * 3);
          for (let i = 0; i < copies; i++) {
            extra.push(listing(l.storeId, Math.round((l.priceAud + rng() * 10) * 100) / 100));
          }
        }
        const all = [...listings, ...extra].sort((a, b) => a.priceAud - b.priceAud);
        inflated.set(cardId, all);
      }
      const deduped = new Map<string, Listing[]>();
      for (const [cardId, listings] of inflated) {
        deduped.set(cardId, dedupeCheapestPerStore(listings));
      }

      const bruteCost = (byCard: Map<string, Listing[]>): number => {
        let bestCost = Infinity;
        for (let mask = 0; mask < 1 << inst.stores.length; mask++) {
          const active = new Set(inst.stores.filter((_, i) => mask & (1 << i)));
          const r = evaluateSubset(inst.items, byCard, active, inst.allPool, inst.flatRates);
          if (r && r.cost < bestCost) bestCost = r.cost;
        }
        return bestCost;
      };

      expect(bruteCost(deduped)).toBeCloseTo(bruteCost(inflated), 9);
    }
  });
});

// ── branchAndBound ────────────────────────────────────────────────────────────

describe("branchAndBound", () => {
  it("finds optimal single-store solution", () => {
    const byCard = new Map([
      ["card-1", [listing("store-a", 5), listing("store-b", 3)]],
      ["card-2", [listing("store-a", 8), listing("store-b", 10)]],
    ]);
    const allPool = new Set(["store-a", "store-b"]);
    const flatRates = { "store-a": 5, "store-b": 12 };
    const best = { cost: Infinity, assignments: null as Map<string, Listing> | null };

    const completed = runBB(["store-a", "store-b"], items, byCard, allPool, flatRates, best);

    // store-a: card-1 $5 + card-2 $8 + flat $5 = $18
    // store-b: card-1 $3 + card-2 $10 + flat $12 = $25
    // optimal is store-a
    expect(completed).toBe(true);
    expect(best.cost).toBe(18);
    expect(best.assignments!.get("card-1")!.storeId).toBe("store-a");
  });

  it("selects multi-store solution when it beats any single store", () => {
    // card-1 is only at store-a, card-2 only at store-b
    const byCard = new Map([
      ["card-1", [listing("store-a", 5)]],
      ["card-2", [listing("store-b", 8)]],
    ]);
    const allPool = new Set(["store-a", "store-b"]);
    const flatRates = { "store-a": 3, "store-b": 3 };
    const best = { cost: Infinity, assignments: null as Map<string, Listing> | null };

    const completed = runBB(["store-a", "store-b"], items, byCard, allPool, flatRates, best);

    // Must use both stores: $5 + $3 flat + $8 + $3 flat = $19
    expect(completed).toBe(true);
    expect(best.cost).toBe(19);
    expect(best.assignments!.get("card-1")!.storeId).toBe("store-a");
    expect(best.assignments!.get("card-2")!.storeId).toBe("store-b");
  });

  it("prunes when no store can satisfy all cards", () => {
    // card-2 has no listings anywhere
    const byCard = new Map([
      ["card-1", [listing("store-a", 5)]],
      ["card-2", []], // unavailable
    ]);
    const allPool = new Set(["store-a"]);
    const flatRates = { "store-a": 5 };
    const best = { cost: Infinity, assignments: null as Map<string, Listing> | null };

    const completed = runBB(["store-a"], items, byCard, allPool, flatRates, best);

    // Should remain at Infinity since card-2 is unavailable
    expect(completed).toBe(true);
    expect(best.cost).toBe(Infinity);
    expect(best.assignments).toBeNull();
  });

  it("returns false and leaves the incumbent untouched when the deadline has passed", () => {
    const byCard = new Map([
      ["card-1", [listing("store-a", 5), listing("store-b", 3)]],
      ["card-2", [listing("store-a", 8), listing("store-b", 10)]],
    ]);
    const allPool = new Set(["store-a", "store-b"]);
    const flatRates = { "store-a": 5, "store-b": 12 };
    const seeded = evaluateSubset(items, byCard, new Set(["store-b"]), allPool, flatRates)!;
    const best = { cost: seeded.cost, assignments: seeded.assignments as Map<string, Listing> | null };

    // Deadline already in the past → immediate cutoff, incumbent stands.
    const completed = runBB(["store-a", "store-b"], items, byCard, allPool, flatRates, best, 0);

    expect(completed).toBe(false);
    expect(best.cost).toBe(seeded.cost);
    expect(best.assignments).toBe(seeded.assignments);
  });
});

// ── Randomized exactness + scale ──────────────────────────────────────────────

/** Deterministic LCG so random tests are reproducible. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomInstance(rng: () => number, storeCount: number, cardCount: number) {
  const stores = Array.from({ length: storeCount }, (_, i) => `s${i}`);
  const flatRates: Record<string, number | null> = {};
  for (const s of stores) flatRates[s] = Math.round((5 + rng() * 5) * 100) / 100;

  const randomItems: OptimizeItem[] = [];
  const byCard = new Map<string, Listing[]>();
  for (let c = 0; c < cardCount; c++) {
    const cardId = `card-${c}`;
    randomItems.push({ cardId, cardName: `Card ${c}`, printingId: `p${c}` });

    // Fisher–Yates shuffle, then take a random handful of stores for this card
    const shuffled = [...stores];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const count = 2 + Math.floor(rng() * 4); // 2–5 stores per card
    const listings = shuffled.slice(0, count).map((s) =>
      listing(s, Math.round((1 + rng() * 20) * 100) / 100)
    );
    byCard.set(cardId, listings);
  }

  return { stores, flatRates, items: randomItems, byCard, allPool: new Set(stores) };
}

describe("branchAndBound exactness", () => {
  it("matches brute-force enumeration on randomized small instances", () => {
    for (const seed of [1, 42, 2026]) {
      const rng = makeRng(seed);
      const inst = randomInstance(rng, 6, 10);

      // Brute force: evaluate every subset of stores
      let bruteCost = Infinity;
      for (let mask = 0; mask < 1 << inst.stores.length; mask++) {
        const active = new Set(inst.stores.filter((_, i) => mask & (1 << i)));
        const r = evaluateSubset(inst.items, inst.byCard, active, inst.allPool, inst.flatRates);
        if (r && r.cost < bruteCost) bruteCost = r.cost;
      }

      const best = { cost: Infinity, assignments: null as Map<string, Listing> | null };
      const completed = runBB(inst.stores, inst.items, inst.byCard, inst.allPool, inst.flatRates, best);

      expect(completed).toBe(true);
      expect(best.cost).toBeCloseTo(bruteCost, 9);
    }
  });
});

describe("optimiser pipeline at scale", () => {
  it("localSearch beats single-store seeds and B&B never worsens it (20 stores × 30 cards)", () => {
    const rng = makeRng(7);
    const inst = randomInstance(rng, 20, 30);
    const started = Date.now();

    // Warm-start seeds, as route.ts does
    const best = { cost: Infinity, assignments: null as Map<string, Listing> | null };
    for (const seedSet of [new Set<string>(), ...inst.stores.map((s) => new Set([s]))]) {
      const r = evaluateSubset(inst.items, inst.byCard, seedSet, inst.allPool, inst.flatRates);
      if (r && r.cost < best.cost) { best.cost = r.cost; best.assignments = r.assignments; }
    }
    const seedCost = best.cost;

    const initialActive = new Set<string>(
      best.assignments ? [...best.assignments.values()].map((l) => l.storeId) : []
    );
    const ls = localSearch(inst.items, inst.byCard, initialActive, inst.stores, inst.allPool, inst.flatRates);
    expect(ls).not.toBeNull();
    expect(ls!.cost).toBeLessThanOrEqual(seedCost);
    expect(Number.isFinite(ls!.cost)).toBe(true);

    if (ls!.cost < best.cost) { best.cost = ls!.cost; best.assignments = ls!.assignments; }
    const warmStartCost = best.cost;

    runBB(inst.stores, inst.items, inst.byCard, inst.allPool, inst.flatRates, best, Date.now() + 1500);

    expect(best.cost).toBeLessThanOrEqual(warmStartCost);
    expect(best.assignments).not.toBeNull();
    // Whole pipeline (seeds + local search + bounded B&B) stays fast
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
