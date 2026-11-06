import { describe, it, expect } from "vitest";
import { applyPlan, itemQty, listStores, parseSavedPrefs, requestPrefs, toLines } from "./want-list";
import { offer } from "./test-fixtures";
import type { WantListItem } from "../../app/WantListContext";
import type { OptimiseResponse, PlanUnit } from "./types";

function item(id: string, o: Partial<WantListItem> = {}): WantListItem {
  return {
    id, cardId: `card-${id}`, cardSlug: `slug-${id}`, cardName: `Card ${id}`, printingId: "p1", setName: "Set",
    setCode: "set", rarity: "common", isFoil: false, storeId: "a", storeName: "A", priceAud: 1.1, shippingAud: null,
    condition: "NM", url: `u-${id}`, imageUri: null, ...o,
  };
}

function response(units: Pick<PlanUnit, "lineId" | "qty" | "offer">[]): OptimiseResponse {
  const flags = { printingChanged: false, conditionChanged: false, conditionUnknown: false, stockUnconfirmed: false };
  return {
    plan: {
      stores: [{
        storeId: "b", storeName: "B", kind: "flat", subtotalCents: 0, postageCents: 0, postageWaived: false, freeShippingGapCents: null,
        units: units.map((u) => ({ ...u, cardId: "x", cardName: "x", flags })),
      }],
      totals: { cardsCents: 0, postageCents: 0, totalCents: 0, storeCount: 1, parcelCount: 1, unitsWanted: 0, unitsFilled: 0 },
    },
    alternatives: [],
    current: { totals: { cardsCents: 0, postageCents: 0, totalCents: 0, storeCount: 0, parcelCount: 0, unitsWanted: 0, unitsFilled: 0 }, missing: [], repriced: [] },
    savingsCents: null,
    unavailable: [],
    proven: true,
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
    expect(p).toMatchObject({ postageOverrides: { a: 650, b: 0 }, includeEbay: true, finish: "any", excludeStores: ["ebay_au"] });
  });
});

describe("listStores", () => {
  it("groups items by store, with flat postage per store and eBay's per listing", () => {
    const stores = listStores([
      item("1", { qty: 2 }), item("2", { storeId: "ebay_au", storeName: "eBay AU", shippingAud: 1.5 }), item("3"),
      item("4", { storeId: "b", storeName: "B" }),
    ], (id) => (id === "a" ? 650 : null));
    expect(stores.map((s) => [s.storeId, s.kind, s.subtotalCents, s.postageCents, s.units.map((u) => [u.lineId, u.qty])])).toEqual([
      ["a", "flat", 330, 650, [["1", 2], ["3", 1]]],
      ["ebay_au", "per-item", 110, 150, [["2", 1]]],
      ["b", "flat", 110, 0, [["4", 1]]],
    ]);
    expect(stores[1].units[0].offer).toMatchObject({ priceCents: 110, shippingCents: 150, finish: "nonfoil" });
  });
});

describe("applyPlan", () => {
  it("moves each item to its planned listing, keeping card fields, mode and order", () => {
    const items = [item("1", { qty: 2, printingMode: "any" }), item("2")];
    const next = applyPlan(items, response([
      { lineId: "2", qty: 1, offer: offer("b", 50, { url: "u-b2" }) },
      { lineId: "1", qty: 2, offer: offer("b", 30, { printingId: "p9", url: "u-b1", shippingCents: 125 }) },
    ]));
    expect(next.map((i) => [i.id, i.cardSlug, i.qty, i.printingMode, i.priceAud, i.shippingAud])).toEqual([
      ["p9-b-u-b1", "slug-1", 2, "any", 0.3, 1.25],
      ["p1-b-u-b2", "slug-2", 1, undefined, 0.5, null],
    ]);
  });

  it("splits an item across listings and keeps unfilled copies on the original", () => {
    const next = applyPlan([item("1", { qty: 4 })], response([
      { lineId: "1", qty: 1, offer: offer("b", 30, { url: "x" }) },
      { lineId: "1", qty: 2, offer: offer("b", 40, { url: "y" }) },
    ]));
    expect(next.map((i) => [i.url, i.qty])).toEqual([["x", 1], ["y", 2], ["u-1", 1]]);
  });

  it("leaves items the plan doesn't cover, and merges two lines planned onto one listing", () => {
    const next = applyPlan([item("1"), item("2"), item("3")], response([
      { lineId: "1", qty: 1, offer: offer("b", 30, { url: "same" }) },
      { lineId: "2", qty: 1, offer: offer("b", 30, { url: "same" }) },
    ]));
    expect(next.map((i) => [i.id, i.qty])).toEqual([["p1-b-same", 2], ["3", undefined]]);
  });
});

describe("parseSavedPrefs", () => {
  it("defaults when nothing is saved or it's unreadable", () => {
    const defaults = { conditions: ["NM"], excludeStores: [], maxStores: null };
    expect(parseSavedPrefs(null)).toEqual(defaults);
    expect(parseSavedPrefs("{not json")).toEqual(defaults);
    expect(parseSavedPrefs("[1]")).toEqual(defaults);
  });

  it("keeps valid fields and drops invalid ones", () => {
    expect(parseSavedPrefs(JSON.stringify({
      conditions: ["MP", "EX", "NM", 4], finish: "foil", excludeStores: ["a", 3, ""], maxStores: 0,
    }))).toEqual({ conditions: ["NM", "MP"], excludeStores: ["a"], maxStores: null });
  });

  it("falls back to NM when no condition is left", () => {
    expect(parseSavedPrefs(JSON.stringify({ conditions: [] })).conditions).toEqual(["NM"]);
  });

  it.each([
    ["NM", ["NM"]],
    ["MP", ["NM", "LP", "MP"]],
    ["any", ["NM", "LP", "MP", "HP", "DMG"]],
  ])("turns an old %s floor into the conditions at or above it", (floor, conditions) => {
    expect(parseSavedPrefs(JSON.stringify({ minCondition: floor })).conditions).toEqual(conditions);
  });

  it("moves an old eBay-off setting into the store list", () => {
    expect(parseSavedPrefs(JSON.stringify({ includeEbay: false, excludeStores: ["a"] })).excludeStores).toEqual(["a", "ebay_au"]);
  });
});
