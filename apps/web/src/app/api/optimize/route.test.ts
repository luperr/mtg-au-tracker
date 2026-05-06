import { describe, it, expect } from "vitest";
import { branchAndBound, evaluateSubset } from "./algorithm";
import type { OptimizeItem } from "./algorithm";

// ── Test fixtures ─────────────────────────────────────────────────────────────

type Listing = {
  printingId: string;
  storeId: string;
  storeName: string;
  priceAud: number;
  shippingAud: number | null;
  condition: string | null;
  url: string | null;
  setName: string;
  setCode: string;
  rarity: string;
  isFoil: boolean;
  imageUri: string | null;
};

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
    imageUri: null,
  };
}

const items: OptimizeItem[] = [
  { cardId: "card-1", cardName: "Card One", printingId: "p1" },
  { cardId: "card-2", cardName: "Card Two", printingId: "p2" },
];

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

    branchAndBound(
      ["store-a", "store-b"],
      0,
      new Set(),
      items,
      byCard,
      allPool,
      flatRates,
      best,
    );

    // store-a: card-1 $5 + card-2 $8 + flat $5 = $18
    // store-b: card-1 $3 + card-2 $10 + flat $12 = $25
    // optimal is store-a
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

    branchAndBound(
      ["store-a", "store-b"],
      0,
      new Set(),
      items,
      byCard,
      allPool,
      flatRates,
      best,
    );

    // Must use both stores: $5 + $3 flat + $8 + $3 flat = $19
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

    branchAndBound(
      ["store-a"],
      0,
      new Set(),
      items,
      byCard,
      allPool,
      flatRates,
      best,
    );

    // Should remain at Infinity since card-2 is unavailable
    expect(best.cost).toBe(Infinity);
    expect(best.assignments).toBeNull();
  });
});
