import { describe, it, expect } from "vitest";
import { applyPlan, itemQty, parseSavedPrefs, requestPrefs, toLines } from "./want-list";
import { optimiserV2Enabled } from "./flag";
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

describe("optimiserV2Enabled", () => {
  it.each([
    ["1", false, true],
    ["0", true, false],
    [undefined, true, true],
    [undefined, false, false],
    ["junk", false, false],
  ] as const)("cookie %s, default %s → %s", (cookie, defaultOn, on) => {
    expect(optimiserV2Enabled(cookie, defaultOn)).toBe(on);
  });
});

describe("toLines", () => {
  it("defaults old items to one exact copy, and sends the price seen in cents", () => {
    expect(toLines([item("1")])).toEqual([{
      lineId: "1", cardId: "card-1", cardName: "Card 1", qty: 1, printing: "exact", printingId: "p1",
      current: { printingId: "p1", storeId: "a", condition: "NM", url: "u-1", seenCents: 110 },
    }]);
  });

  it("carries qty and printing mode, clamping a hand-edited qty", () => {
    const [a, b] = toLines([item("1", { qty: 4, printingMode: "any" }), item("2", { qty: 1000 })]);
    expect(a).toMatchObject({ qty: 4, printing: "any" });
    expect(b.qty).toBe(99);
    expect(itemQty({ qty: 2.5 })).toBe(1);
  });
});

describe("requestPrefs", () => {
  it("converts postage overrides to cents", () => {
    expect(requestPrefs(parseSavedPrefs(null), { a: 6.5, b: 0 }).postageOverrides).toEqual({ a: 650, b: 0 });
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
    const defaults = { minCondition: "LP", finish: "nonfoil", excludeStores: [], includeEbay: true, maxStores: null };
    expect(parseSavedPrefs(null)).toEqual(defaults);
    expect(parseSavedPrefs("{not json")).toEqual(defaults);
    expect(parseSavedPrefs("[1]")).toEqual(defaults);
  });

  it("keeps valid fields and drops invalid ones", () => {
    expect(parseSavedPrefs(JSON.stringify({
      minCondition: "NM", finish: "gold", excludeStores: ["a", 3, ""], includeEbay: false, maxStores: 0,
    }))).toEqual({ minCondition: "NM", finish: "nonfoil", excludeStores: ["a"], includeEbay: false, maxStores: null });
  });
});
