import { describe, it, expect } from "vitest";
import { parseOptimiseRequest } from "./request";
import { DEFAULT_PREFS } from "./types";
import { MAX_BULK_CARDS } from "../config";

const ln = { lineId: "l1", cardId: "c1", cardName: "Counterspell", qty: 4, printing: "any", printingId: null };
const current = { printingId: "p1", storeId: "a", condition: "NM", url: "u", seenCents: 150 };

describe("parseOptimiseRequest", () => {
  it("accepts a minimal body and fills in the defaults", () => {
    expect(parseOptimiseRequest({ lines: [ln] })).toEqual({
      lines: [{ ...ln, current: null }],
      prefs: DEFAULT_PREFS,
    });
  });

  it("keeps current listings and prefs", () => {
    const prefs = {
      conditions: ["NM", "LP"], excludeStores: ["a", "ebay_au"], maxStores: 3,
      postageOverrides: { b: 0 },
    };
    const r = parseOptimiseRequest({ lines: [{ ...ln, printing: "exact", printingId: "p1", current }], prefs });
    expect(r).toEqual({
      lines: [{ ...ln, printing: "exact", printingId: "p1", current }],
      prefs,
    });
  });

  it("drops unknown fields", () => {
    const r = parseOptimiseRequest({ lines: [{ ...ln, priceAud: 1, current: { ...current, id: 5 } }] });
    expect("lines" in r && r.lines[0]).toEqual({ ...ln, current });
  });

  it.each([
    ["a non-object body", null],
    ["no lines", { lines: [] }],
    ["a line without a cardId", { lines: [{ ...ln, cardId: "" }] }],
    ["a fractional qty", { lines: [{ ...ln, qty: 1.5 }] }],
    ["a zero qty", { lines: [{ ...ln, qty: 0 }] }],
    ["a huge qty", { lines: [{ ...ln, qty: 1000 }] }],
    ["an unknown printing mode", { lines: [{ ...ln, printing: "some" }] }],
    ["an exact line with no printing", { lines: [{ ...ln, printing: "exact" }] }],
    ["a current listing in dollars", { lines: [{ ...ln, current: { ...current, seenCents: 1.5 } }] }],
    ["duplicate line ids", { lines: [ln, ln] }],
    ["an unknown condition", { lines: [ln], prefs: { conditions: ["NM", "EX"] } }],
    ["no conditions", { lines: [ln], prefs: { conditions: [] } }],
    ["a condition string", { lines: [ln], prefs: { conditions: "NM" } }],
    ["a zero store cap", { lines: [ln], prefs: { maxStores: 0 } }],
    ["a negative override", { lines: [ln], prefs: { postageOverrides: { a: -100 } } }],
    ["an override in dollars", { lines: [ln], prefs: { postageOverrides: { a: 6.5 } } }],
  ])("rejects %s", (_, body) => {
    expect(parseOptimiseRequest(body)).toHaveProperty("error");
  });

  it("caps the number of lines", () => {
    const lines = Array.from({ length: MAX_BULK_CARDS + 1 }, (_, i) => ({ ...ln, lineId: `l${i}` }));
    expect(parseOptimiseRequest({ lines })).toHaveProperty("error");
    expect(parseOptimiseRequest({ lines: lines.slice(0, MAX_BULK_CARDS) })).not.toHaveProperty("error");
  });
});
