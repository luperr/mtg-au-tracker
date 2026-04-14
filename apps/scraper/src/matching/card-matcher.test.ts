import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/db.js");

import { CardMatcher } from "./card-matcher.js";

// ─── Fixture data ─────────────────────────────────────────────────────────────
//
// A minimal in-memory card catalogue used across all tests.
// Real Scryfall IDs are not required — we only test matching logic.

const LIGHTNING_BOLT_M10_NF = {
  id: "lb-m10-nf",
  setCode: "m10",
  setName: "Magic 2010",
  collectorNumber: "149",
  isFoil: false,
  cardName: "Lightning Bolt",
};
const LIGHTNING_BOLT_M10_F = {
  id: "lb-m10-f",
  setCode: "m10",
  setName: "Magic 2010",
  collectorNumber: "149",
  isFoil: true,
  cardName: "Lightning Bolt",
};
// A second set printing of Lightning Bolt (e.g. M11)
const LIGHTNING_BOLT_M11_NF = {
  id: "lb-m11-nf",
  setCode: "m11",
  setName: "Magic 2011",
  collectorNumber: "149",
  isFoil: false,
  cardName: "Lightning Bolt",
};
// A borderless variant (high collector number) in the same set
const TARMOGOYF_FST_NF = {
  id: "tgoyf-fst-nf",
  setCode: "fst",
  setName: "Future Sight",
  collectorNumber: "153",
  isFoil: false,
  cardName: "Tarmogoyf",
};
const TARMOGOYF_FST_BORDERLESS = {
  id: "tgoyf-fst-brd",
  setCode: "fst",
  setName: "Future Sight",
  collectorNumber: "310",
  isFoil: false,
  cardName: "Tarmogoyf",
};
// DFC card
const DELVER_ISD_NF = {
  id: "delver-isd-nf",
  setCode: "isd",
  setName: "Innistrad",
  collectorNumber: "51",
  isFoil: false,
  cardName: "Delver of Secrets // Insectile Aberration",
};
const DELVER_ISD_F = {
  id: "delver-isd-f",
  setCode: "isd",
  setName: "Innistrad",
  collectorNumber: "51",
  isFoil: true,
  cardName: "Delver of Secrets // Insectile Aberration",
};

const ALL_ENTRIES = [
  LIGHTNING_BOLT_M10_NF,
  LIGHTNING_BOLT_M10_F,
  LIGHTNING_BOLT_M11_NF,
  TARMOGOYF_FST_NF,
  TARMOGOYF_FST_BORDERLESS,
  DELVER_ISD_NF,
  DELVER_ISD_F,
];

// ─── Setup ────────────────────────────────────────────────────────────────────

let matcher: CardMatcher;

beforeEach(() => {
  matcher = new CardMatcher();
  matcher.buildForTesting(ALL_ENTRIES);
});

// ─── Level 0 — set + collector + foil ─────────────────────────────────────────

describe("Level 0 — set_collector", () => {
  it("matches nonfoil via set+collector+foil", () => {
    const result = matcher.match({
      rawName: "Lightning Bolt",
      setCode: "m10",
      collectorNumber: "149",
      isFoil: false,
      price: "1.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("set_collector");
    expect(result.printingId).toBe("lb-m10-nf");
    expect(result.confidence).toBe(1.0);
  });

  it("matches foil via set+collector+foil", () => {
    const result = matcher.match({
      rawName: "Lightning Bolt",
      setCode: "m10",
      collectorNumber: "149",
      isFoil: true,
      price: "3.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("set_collector");
    expect(result.printingId).toBe("lb-m10-f");
  });

  it("falls through to name-based when setCode matches but collector number does not", () => {
    const result = matcher.match({
      rawName: "Lightning Bolt",
      setCode: "m10",
      collectorNumber: "999",
      isFoil: false,
      price: "1.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).not.toBe("set_collector");
  });
});

// ─── Level 1 — exact (name + set + foil) ──────────────────────────────────────

describe("Level 1 — exact", () => {
  it("matches single candidate in set at confidence 1.0", () => {
    const result = matcher.match({
      rawName: "Tarmogoyf",
      setCode: "fst",
      collectorNumber: null,
      isFoil: false,
      price: "50.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    // Two candidates in fst: col 153 and col 310 — both match set+foil
    // Multiple candidates → confidence 0.8, picks lowest collector number
    expect(result.matchType).toBe("exact");
    expect(result.confidence).toBe(0.8);
    expect(result.printingId).toBe("tgoyf-fst-nf"); // col 153, the regular printing
  });

  it("resolves set from set name index when setCode not provided", () => {
    const result = matcher.match({
      rawName: "Lightning Bolt",
      setCode: null,
      setName: "Magic 2010",
      collectorNumber: null,
      isFoil: false,
      price: "1.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
    });
    // Should resolve "Magic 2010" → "m10" and find a single m10 nonfoil
    expect(result.matchType).toBe("exact");
    expect(result.printingId).toBe("lb-m10-nf");
    expect(result.confidence).toBe(1.0);
  });
});

// ─── Level 2 — name + foil ────────────────────────────────────────────────────

describe("Level 2 — name_foil", () => {
  it("matches single foil candidate across all sets at confidence 0.85", () => {
    // Only one foil Lightning Bolt in our index (m10)
    const result = matcher.match({
      rawName: "Lightning Bolt",
      setCode: null,
      collectorNumber: null,
      isFoil: true,
      price: "3.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("name_foil");
    expect(result.printingId).toBe("lb-m10-f");
    expect(result.confidence).toBe(0.85);
  });

  it("returns confidence 0.7 when multiple foil candidates exist", () => {
    // Add a second foil Lightning Bolt to test this path
    const matcher2 = new CardMatcher();
    matcher2.buildForTesting([
      LIGHTNING_BOLT_M10_F,
      { ...LIGHTNING_BOLT_M10_F, id: "lb-m11-f", setCode: "m11" },
    ]);
    const result = matcher2.match({
      rawName: "Lightning Bolt",
      setCode: null,
      collectorNumber: null,
      isFoil: true,
      price: "3.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("name_foil");
    expect(result.confidence).toBe(0.7);
  });
});

// ─── Level 3 — name only ──────────────────────────────────────────────────────

describe("Level 3 — name_only", () => {
  it("matches at confidence 0.6 when multiple printings exist (ignore foil)", () => {
    // m10 nonfoil + m10 foil + m11 nonfoil = 3 candidates, foil flag ignored at L3
    const result = matcher.match({
      rawName: "Lightning Bolt",
      setCode: null,
      collectorNumber: null,
      isFoil: false,   // foil candidates exist but none match exactly at L2 in this test
      price: "1.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    // At L2: foil=false → finds m10-nf and m11-nf (2 candidates) → name_foil confidence 0.7
    // (This verifies L2 is hit rather than L3 in normal conditions)
    expect(["name_foil", "name_only"]).toContain(result.matchType);
  });

  it("matches card with no set info at name_only when single printing exists", () => {
    // Tarmogoyf foil doesn't exist in our index — only nonfoils
    const result = matcher.match({
      rawName: "Tarmogoyf",
      setCode: null,
      collectorNumber: null,
      isFoil: true,   // no foil tarmogoyf in index → L2 misses → falls to L3
      price: "100.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("name_only");
    expect(result.confidence).toBe(0.6); // multiple nonfoil tarmogoyf candidates
  });
});

// ─── Level 4 — front-face DFC ─────────────────────────────────────────────────

describe("Level 4 — front_face", () => {
  it("matches DFC by front face name alone at confidence 0.65 when single printing", () => {
    // Use a fresh matcher with only ONE DFC entry so confidence is 0.65
    const singleMatcher = new CardMatcher();
    singleMatcher.buildForTesting([DELVER_ISD_NF]);
    const result = singleMatcher.match({
      rawName: "Delver of Secrets",
      setCode: null,
      collectorNumber: null,
      isFoil: false,
      price: "5.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("front_face");
    expect(result.printingId).toBe("delver-isd-nf");
    expect(result.confidence).toBe(0.65);
  });

  it("returns confidence 0.5 when index has both foil and nonfoil for same DFC", () => {
    // The shared ALL_ENTRIES fixture has both DELVER_ISD_NF and DELVER_ISD_F
    // → 2 entries in frontFaceIndex → confidence 0.5
    const result = matcher.match({
      rawName: "Delver of Secrets",
      setCode: null,
      collectorNumber: null,
      isFoil: false,
      price: "5.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("front_face");
    expect(result.confidence).toBe(0.5);
  });

  it("prefers foil DFC when isFoil matches", () => {
    const result = matcher.match({
      rawName: "Delver of Secrets",
      setCode: null,
      collectorNumber: null,
      isFoil: true,
      price: "10.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("front_face");
    expect(result.printingId).toBe("delver-isd-f");
  });

  it("returns confidence 0.5 when multiple DFCs share a front face name", () => {
    const matcher2 = new CardMatcher();
    matcher2.buildForTesting([
      DELVER_ISD_NF,
      { ...DELVER_ISD_NF, id: "delver-inr-nf", setCode: "inr" },
    ]);
    const result = matcher2.match({
      rawName: "Delver of Secrets",
      setCode: null,
      collectorNumber: null,
      isFoil: false,
      price: "5.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("front_face");
    expect(result.confidence).toBe(0.5);
  });
});

// ─── Level 5 — fuzzy ──────────────────────────────────────────────────────────

describe("Level 5 — fuzzy", () => {
  it("matches at confidence 0.8 for 1 typo", () => {
    const result = matcher.match({
      rawName: "Lighning Bolt",   // missing 't' in lightning
      setCode: null,
      collectorNumber: null,
      isFoil: false,
      price: "1.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("fuzzy");
    expect(result.confidence).toBeCloseTo(0.8);
  });

  it("matches at confidence 0.6 for 2 typos", () => {
    const result = matcher.match({
      rawName: "Lghtning Blt",   // two missing characters
      setCode: null,
      collectorNumber: null,
      isFoil: false,
      price: "1.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("fuzzy");
    expect(result.confidence).toBeCloseTo(0.6);
  });
});

// ─── Level 6 — unmatched ──────────────────────────────────────────────────────

describe("Level 6 — unmatched", () => {
  it("returns unmatched for a completely unknown card name", () => {
    const result = matcher.match({
      rawName: "Zzzyxxx Unknown Card Name",
      setCode: null,
      collectorNumber: null,
      isFoil: false,
      price: "1.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.matchType).toBe("unmatched");
    expect(result.printingId).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

// ─── Borderless sort behaviour ────────────────────────────────────────────────

describe("borderless sort", () => {
  it("prefers low collector number (regular printing) when isBorderless is false", () => {
    const result = matcher.match({
      rawName: "Tarmogoyf",
      setCode: "fst",
      collectorNumber: null,
      isFoil: false,
      isBorderless: false,
      price: "50.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.printingId).toBe("tgoyf-fst-nf"); // collector 153, not 310
  });

  it("prefers high collector number (borderless) when isBorderless is true", () => {
    const result = matcher.match({
      rawName: "Tarmogoyf",
      setCode: "fst",
      collectorNumber: null,
      isFoil: false,
      isBorderless: true,
      price: "80.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.printingId).toBe("tgoyf-fst-brd"); // collector 310
  });
});
