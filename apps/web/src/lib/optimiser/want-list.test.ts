import { describe, it, expect } from "vitest";
import { baselineStores, itemQty, parseSavedPrefs, requestPrefs, toLines } from "./want-list";
import type { WantListItem } from "../../app/WantListContext";

function item(id: string, o: Partial<WantListItem> = {}): WantListItem {
  return {
    id, cardId: `card-${id}`, cardSlug: `slug-${id}`, cardName: `Card ${id}`, printingId: "p1", setName: "Set",
    setCode: "set", rarity: "common", isFoil: false, storeId: "a", storeName: "A", priceAud: 1.1, shippingAud: null,
    condition: "NM", url: `u-${id}`, imageUri: null, ...o,
  };
}

describe("toLines", () => {
  it("defaults items to one copy of any printing, and sends the price seen in cents", () => {
    expect(toLines([item("1")])).toEqual([{
      lineId: "1", cardId: "card-1", cardName: "Card 1", qty: 1, printing: "any", printingId: "p1",
      current: { printingId: "p1", storeId: "a", condition: "NM", url: "u-1", seenCents: 110 },
    }]);
  });

  it("carries qty and printing mode, clamping a hand-edited qty", () => {
    const [a, b] = toLines([item("1", { qty: 4, printingMode: "exact" }), item("2", { qty: 1000 })]);
    expect(a).toMatchObject({ qty: 4, printing: "exact" });
    expect(b.qty).toBe(99);
    expect(itemQty({ qty: 2.5 })).toBe(1);
  });
});

describe("requestPrefs", () => {
  it("converts postage overrides to cents and leaves eBay to excludeStores", () => {
    const p = requestPrefs({ ...parseSavedPrefs(null), excludeStores: ["ebay_au"] }, { a: 6.5, b: 0 });
    expect(p).toMatchObject({ postageOverrides: { a: 650, b: 0 }, includeEbay: true, excludeStores: ["ebay_au"] });
  });
});

describe("baselineStores", () => {
  it("groups items by the store they were added from, in plan shape", () => {
    const stores = baselineStores([
      item("1", { qty: 2 }), item("2", { storeId: "ebay_au", storeName: "eBay AU", shippingAud: 1.5 }), item("3"),
    ]);
    expect(stores.map((s) => [s.storeId, s.kind, s.subtotalCents, s.units.map((u) => [u.lineId, u.qty])])).toEqual([
      ["a", "flat", 330, [["1", 2], ["3", 1]]],
      ["ebay_au", "per-item", 110, [["2", 1]]],
    ]);
    expect(stores[1].units[0].offer).toMatchObject({ priceCents: 110, shippingCents: 150, finish: "nonfoil" });
  });
});

describe("parseSavedPrefs", () => {
  it("defaults when nothing is saved or it's unreadable", () => {
    const defaults = { minCondition: "LP", finish: "any", excludeStores: [], maxStores: null };
    expect(parseSavedPrefs(null)).toEqual(defaults);
    expect(parseSavedPrefs("{not json")).toEqual(defaults);
    expect(parseSavedPrefs("[1]")).toEqual(defaults);
  });

  it("keeps valid fields and drops invalid ones", () => {
    expect(parseSavedPrefs(JSON.stringify({
      minCondition: "NM", finish: "gold", excludeStores: ["a", 3, ""], maxStores: 0,
    }))).toEqual({ minCondition: "NM", finish: "any", excludeStores: ["a"], maxStores: null });
  });

  it("moves an old eBay-off setting into the store list", () => {
    expect(parseSavedPrefs(JSON.stringify({ includeEbay: false, excludeStores: ["a"] })).excludeStores).toEqual(["a", "ebay_au"]);
  });
});
