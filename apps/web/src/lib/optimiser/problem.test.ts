import { describe, it, expect } from "vitest";
import { meetsCondition, offerFromRow, toCents, type OfferRow } from "./problem";
import { line, offer, prefs, problem, store } from "./test-fixtures";

const stores = [store("a", 500), store("b", 700), store("ebay_au", null)];

/** Offers a line may use, as `${storeId}:${printingId}:${condition}`. */
function candidates(...args: Parameters<typeof problem>): string[] {
  const p = problem(...args);
  return p.lines[0]?.cands.map((i) => {
    const o = p.offers[i];
    return `${o.storeId}:${o.printingId}:${o.condition}`;
  }) ?? [];
}

describe("toCents", () => {
  it.each([
    ["0.29", 29],
    ["12.50", 1250],
    ["4", 400],
    ["1.10", 110],
    ["218.66", 21866],
  ])("%s → %i", (aud, cents) => {
    expect(toCents(aud)).toBe(cents);
  });
});

describe("offerFromRow", () => {
  it("converts prices to cents and keeps stock and variant", () => {
    const row: OfferRow = {
      printing_id: "p1", card_id: "c1", set_name: "S", set_code: "s", rarity: "rare", is_foil: true, finish: null,
      border_color: null, frame_effects: [], image_uri: null, price_aud: "3.30", shipping_aud: "", condition: "NM",
      url: "u", store_id: "a", store_name: "A", stock_qty: 2, variant_id: "123",
    };
    expect(offerFromRow(row)).toMatchObject({
      priceCents: 330, shippingCents: null, finish: "foil", stockQty: 2, variantId: "123",
    });
    expect(offerFromRow(row)).not.toHaveProperty("priceAud");
  });
});

describe("meetsCondition", () => {
  it.each([
    ["NM", ["NM"], true],
    ["LP", ["NM"], false],
    ["LP", ["NM", "LP"], true],
    ["MP", ["LP", "HP"], false],
    ["HP", ["LP", "HP"], true],
    ["DMG", ["NM", "LP", "MP", "HP"], false],
    [null, ["NM"], true],
    ["Signed", ["NM"], true],
  ] as const)("%s against %j → %s", (condition, conditions, ok) => {
    expect(meetsCondition(condition, prefs({ conditions: [...conditions] }))).toBe(ok);
  });
});

describe("buildProblem eligibility", () => {
  const offers = {
    c1: [
      offer("a", 100, { condition: "HP" }),
      offer("a", 200, { condition: "NM" }),
      offer("b", 150, { printingId: "p2", finish: "foil" }),
      offer("ebay_au", 90, { condition: null, shippingCents: 0 }),
    ],
  };

  it("applies the chosen conditions but lets unknown conditions through", () => {
    expect(candidates([line("c1")], offers, stores, prefs({ conditions: ["NM", "LP"] })))
      .toEqual(["ebay_au:p1:null", "b:p2:NM", "a:p1:NM"]);
  });

  it("an exact line only takes its printing", () => {
    expect(candidates([line("c1", { printing: "exact" })], offers, stores))
      .toEqual(["ebay_au:p1:null", "a:p1:HP"]);
  });

  it("an any-printing line takes every printing, whatever its finish", () => {
    expect(candidates([line("c1")], offers, stores)).toContain("b:p2:NM");
  });

  it("drops excluded stores, eBay included", () => {
    expect(candidates([line("c1")], offers, stores, prefs({ excludeStores: ["a", "ebay_au"] })))
      .toEqual(["b:p2:NM"]);
  });

  it("reports why a line has nothing to buy", () => {
    const p = problem([line("c1"), line("c2")], offers, stores, prefs({ conditions: ["DMG"], excludeStores: ["ebay_au"] }));
    expect(p.unavailable).toEqual([
      { lineId: "c1", cardId: "c1", cardName: "c1", reason: "no-match", missing: 1 },
      { lineId: "c2", cardId: "c2", cardName: "c2", reason: "no-listings", missing: 1 },
    ]);
  });

  it("at equal cost, puts the line's current listing ahead, then its printing", () => {
    const tied = { c1: [offer("b", 100, { printingId: "p2" }), offer("a", 100, { printingId: "p2" }), offer("a", 100)] };
    // a's p2 copy is trimmed: a's first offer already covers the line.
    expect(candidates([line("c1")], tied, stores)).toEqual(["a:p1:NM", "b:p2:NM"]);
    const current = { ...tied.c1[0], seenCents: 100 };
    expect(candidates([line("c1", { current })], tied, stores)[0]).toBe("b:p2:NM");
  });

  it("keeps a store's dearer offers only while its cheaper ones lack the stock", () => {
    const stocked = { c1: [offer("a", 100, { stockQty: 1 }), offer("a", 120, { stockQty: 1 }), offer("a", 130, { stockQty: 5 }), offer("a", 140)] };
    expect(candidates([line("c1", { qty: 3 })], stocked, stores)).toHaveLength(3);
    expect(candidates([line("c1", { qty: 1 })], stocked, stores)).toHaveLength(1);
    expect(candidates([line("c1", { qty: 9 })], { c1: [offer("a", 100), offer("a", 120)] }, stores)).toHaveLength(1);
  });

  it("orders the pool cheapest postage first and leaves eBay out of it", () => {
    const p = problem([line("c1")], { c1: [offer("b", 1), offer("a", 1), offer("ebay_au", 1)] }, stores);
    expect(p.pool.map((s) => p.stores[s].storeId)).toEqual(["a", "b"]);
  });

  it("applies postage overrides", () => {
    const p = problem([line("c1")], offers, stores, prefs({ postageOverrides: { b: 0 } }));
    expect(p.flat).toEqual([500, 0, null]);
  });
});
