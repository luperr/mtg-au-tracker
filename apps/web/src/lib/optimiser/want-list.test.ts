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

function response(units: (Pick<PlanUnit, "lineId" | "qty" | "offer"> & Partial<Pick<PlanUnit, "flags">>)[]): OptimiseResponse {
  const flags = { printingChanged: false, conditionChanged: false, conditionUnknown: false, stockUnconfirmed: false };
  return {
    plan: {
      stores: [{
        storeId: "b", storeName: "B", kind: "flat", subtotalCents: 0, postageCents: 0, postageWaived: false, freeShippingGapCents: null,
        units: units.map((u) => ({ cardId: "x", cardName: "x", ...u, flags: u.flags ?? flags })),
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
  it("converts postage overrides to cents and keeps the saved prefs", () => {
    const p = requestPrefs({ ...parseSavedPrefs(null), excludeStores: ["ebay_au"] }, { a: 6.5, b: 0 });
    expect(p).toEqual({ conditions: ["NM"], excludeStores: ["ebay_au"], maxStores: null, postageOverrides: { a: 650, b: 0 } });
  });
});

describe("listStores", () => {
  it("groups items by store: flat postage once per store, per-item postage per copy where there's no flat rate", () => {
    const stores = listStores([
      item("1", { qty: 2 }), item("2", { storeId: "ebay_au", storeName: "eBay AU", shippingAud: 1.5 }), item("3"),
      item("4", { storeId: "b", storeName: "B" }),
    ], (id) => ({ a: 650, b: 0 } as Record<string, number>)[id] ?? null);
    expect(stores.map((s) => [s.storeId, s.kind, s.subtotalCents, s.postageCents, s.items.map((i) => i.id)])).toEqual([
      ["a", "flat", 330, 650, ["1", "3"]],
      ["ebay_au", "per-item", 110, 150, ["2"]],
      ["b", "flat", 110, 0, ["4"]],
    ]);
  });
});

const flagsOf = (o: Partial<PlanUnit["flags"]> = {}) =>
  ({ printingChanged: false, conditionChanged: false, conditionUnknown: false, stockUnconfirmed: false, ...o });

describe("applyPlan", () => {
  it("moves each item to its planned listing, keeping card fields, mode and order", () => {
    const items = [item("1", { qty: 2, printingMode: "exact" }), item("2")];
    const next = applyPlan(items, response([
      { lineId: "2", qty: 1, offer: offer("b", 50, { url: "u-b2" }) },
      { lineId: "1", qty: 2, offer: offer("b", 30, { printingId: "p9", url: "u-b1", shippingCents: 125 }) },
    ])).items;
    expect(next.map((i) => [i.id, i.cardSlug, i.qty, i.printingMode, i.priceAud, i.shippingAud])).toEqual([
      ["p9-b-u-b1", "slug-1", 2, "exact", 0.3, 1.25],
      ["p1-b-u-b2", "slug-2", 1, "any", 0.5, null],
    ]);
  });

  it("splits an item across listings and keeps unfilled copies on the original", () => {
    const next = applyPlan([item("1", { qty: 4 })], response([
      { lineId: "1", qty: 1, offer: offer("b", 30, { url: "x" }) },
      { lineId: "1", qty: 2, offer: offer("b", 40, { url: "y" }) },
    ])).items;
    expect(next.map((i) => [i.url, i.qty])).toEqual([["x", 1], ["y", 2], ["u-1", 1]]);
  });

  it("leaves items the plan doesn't cover, and merges two lines planned onto one listing", () => {
    const next = applyPlan([item("1"), item("2"), item("3")], response([
      { lineId: "1", qty: 1, offer: offer("b", 30, { url: "same" }) },
      { lineId: "2", qty: 1, offer: offer("b", 30, { url: "same" }) },
    ])).items;
    expect(next.map((i) => [i.id, i.qty])).toEqual([["p1-b-same", 2], ["3", undefined]]);
  });

  it("returns what changed for each item it produced, combining merged lines", () => {
    const { flags } = applyPlan([item("1", { condition: "LP" }), item("2"), item("3")], response([
      { lineId: "1", qty: 1, offer: offer("b", 30, { url: "same" }), flags: flagsOf({ conditionChanged: true }) },
      { lineId: "2", qty: 1, offer: offer("b", 30, { url: "same" }), flags: flagsOf({ printingChanged: true }) },
    ]));
    expect(flags).toEqual(new Map([[
      "p1-b-same", { flags: flagsOf({ conditionChanged: true, printingChanged: true }), prevCondition: "LP" },
    ]]));
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
});
