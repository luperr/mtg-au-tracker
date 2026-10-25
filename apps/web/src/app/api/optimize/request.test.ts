import { describe, it, expect } from "vitest";
import { parseOptimizeRequest } from "./request";
import { MAX_BULK_CARDS } from "../../../lib/config";

const item = { cardId: "c1", cardName: "Lightning Bolt", printingId: "p1" };

describe("parseOptimizeRequest", () => {
  it("accepts a minimal body and defaults the optional fields", () => {
    const r = parseOptimizeRequest({ items: [item] });
    expect(r).toEqual({ items: [item], lockedPrintingIds: new Set(), shippingOverrides: {} });
  });

  it("keeps locks and overrides", () => {
    const r = parseOptimizeRequest({
      items: [item],
      lockedPrintingIds: ["p1"],
      shippingOverrides: { mtg_mate: 0, good_games: 7.5 },
    });
    expect(r).toEqual({
      items: [item],
      lockedPrintingIds: new Set(["p1"]),
      shippingOverrides: { mtg_mate: 0, good_games: 7.5 },
    });
  });

  it("drops unknown item fields rather than passing them through", () => {
    const r = parseOptimizeRequest({ items: [{ ...item, priceAud: 1 }] });
    expect("items" in r && r.items[0]).toEqual(item);
  });

  it.each([
    ["a non-object body", null],
    ["missing items", {}],
    ["empty items", { items: [] }],
    ["a non-string cardId", { items: [{ ...item, cardId: 5 }] }],
    ["an empty printingId", { items: [{ ...item, printingId: "" }] }],
    ["a null item", { items: [null] }],
    ["non-string locks", { items: [item], lockedPrintingIds: [1] }],
    ["an array of overrides", { items: [item], shippingOverrides: [] }],
    ["a negative override", { items: [item], shippingOverrides: { mtg_mate: -5 } }],
    ["a string override", { items: [item], shippingOverrides: { mtg_mate: "5" } }],
    ["a NaN override", { items: [item], shippingOverrides: { mtg_mate: NaN } }],
  ])("rejects %s", (_, body) => {
    expect(parseOptimizeRequest(body)).toHaveProperty("error");
  });

  it("caps the number of items", () => {
    const items = Array.from({ length: MAX_BULK_CARDS + 1 }, (_, i) => ({ ...item, cardId: `c${i}` }));
    expect(parseOptimizeRequest({ items })).toHaveProperty("error");
    expect(parseOptimizeRequest({ items: items.slice(0, MAX_BULK_CARDS) })).not.toHaveProperty("error");
  });
});
