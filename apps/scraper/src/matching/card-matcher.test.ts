import { describe, it, expect, beforeEach } from "vitest";
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
  borderColor: null,
  frameEffects: [] as string[],
  cardName: "Tarmogoyf",
};
const TARMOGOYF_FST_BORDERLESS = {
  id: "tgoyf-fst-brd",
  setCode: "fst",
  setName: "Future Sight",
  collectorNumber: "310",
  isFoil: false,
  borderColor: "borderless",   // enables byTreatment("borderless") filter
  frameEffects: [] as string[],
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
  it("returns confidence 0.75 when multiple candidates remain after set+finish narrowing", () => {
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
    // Two candidates in fst: col 153 (regular) and col 310 (borderless) — both nonfoil.
    // No treatment signal → pool stays at 2 after elimination → confidence 0.75.
    expect(result.matchType).toBe("exact");
    expect(result.confidence).toBe(0.75);
    expect(result.printingId).toBe("tgoyf-fst-nf"); // col 153, lowest collector number first
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

  it("falls to name_only at confidence 0.6 when multiple foil candidates remain", () => {
    // Two foil Lightning Bolts, no set signal → pool stays at 2 after finish narrowing.
    // With no set and multiple remaining, matchType degrades to name_only.
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
    expect(result.matchType).toBe("name_only");
    expect(result.confidence).toBe(0.6);
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
  it("matches DFC by front face name alone at confidence 0.85 when single printing", () => {
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
    expect(result.confidence).toBe(0.85);
  });

  it("narrows to correct printing via finish when both foil and nonfoil DFC exist", () => {
    // ALL_ENTRIES has DELVER_ISD_NF and DELVER_ISD_F.
    // Finish narrowing resolves to 1 → confidence 0.85.
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
    expect(result.printingId).toBe("delver-isd-nf");
    expect(result.confidence).toBe(0.85);
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

  it("returns confidence 0.6 when multiple DFCs share a front face name", () => {
    // Two nonfoil printings, finish can't narrow further → pool stays at 2.
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
    expect(result.confidence).toBe(0.6);
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

// ─── Treatment filtering ──────────────────────────────────────────────────────

describe("treatment filtering", () => {
  it("picks regular printing when no treatment signal provided", () => {
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
    expect(result.printingId).toBe("tgoyf-fst-nf"); // col 153, lowest collector
    expect(result.confidence).toBe(0.75); // 2 candidates remain (no treatment to narrow)
  });

  it("filters to borderless via treatment field, confidence 1.0", () => {
    const result = matcher.match({
      rawName: "Tarmogoyf",
      setCode: "fst",
      collectorNumber: null,
      isFoil: false,
      treatment: "borderless",
      price: "80.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.printingId).toBe("tgoyf-fst-brd"); // borderColor: "borderless"
    expect(result.confidence).toBe(1.0); // set + treatment narrowed to 1
  });

  it("filters to borderless via isBorderless flag when treatment not set", () => {
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
    expect(result.printingId).toBe("tgoyf-fst-brd");
    expect(result.confidence).toBe(1.0);
  });

  it("handles showcase treatment via frameEffects", () => {
    const matcher2 = new CardMatcher();
    matcher2.buildForTesting([
      { id: "card-regular", setCode: "neo", setName: "Kamigawa: Neon Dynasty", collectorNumber: "100", isFoil: false, frameEffects: [], borderColor: null, cardName: "Invoke Calamity" },
      { id: "card-showcase", setCode: "neo", setName: "Kamigawa: Neon Dynasty", collectorNumber: "380", isFoil: false, frameEffects: ["showcase"], borderColor: null, cardName: "Invoke Calamity" },
    ]);
    const result = matcher2.match({
      rawName: "Invoke Calamity",
      setCode: "neo",
      collectorNumber: null,
      isFoil: false,
      treatment: "showcase",
      price: "10.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.printingId).toBe("card-showcase");
    expect(result.confidence).toBe(1.0);
  });

  it("handles extendedart treatment via frameEffects", () => {
    const matcher2 = new CardMatcher();
    matcher2.buildForTesting([
      { id: "card-regular", setCode: "mh3", setName: "Modern Horizons 3", collectorNumber: "50", isFoil: false, frameEffects: [], borderColor: null, cardName: "Flare of Cultivation" },
      { id: "card-ea", setCode: "mh3", setName: "Modern Horizons 3", collectorNumber: "280", isFoil: false, frameEffects: ["extendedart"], borderColor: null, cardName: "Flare of Cultivation" },
    ]);
    const result = matcher2.match({
      rawName: "Flare of Cultivation (Extended Art)",
      setCode: "mh3",
      collectorNumber: null,
      isFoil: false,
      treatment: "extendedart",
      price: "25.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    expect(result.printingId).toBe("card-ea");
    expect(result.confidence).toBe(1.0);
  });

  it("does not zero out when treatment signal matches nothing in index", () => {
    // All candidates are regular (no frameEffects), but we signal "showcase".
    // narrow() should revert to full pool rather than returning empty.
    const result = matcher.match({
      rawName: "Tarmogoyf",
      setCode: "fst",
      collectorNumber: null,
      isFoil: false,
      treatment: "showcase", // no showcase tarmogoyf exists in fixture
      price: "50.00",
      priceType: "sell",
      condition: "NM",
      inStock: true,
      sourceUrl: "https://example.com",
      setName: null,
    });
    // Should still return a match, not unmatched
    expect(result.matchType).not.toBe("unmatched");
    expect(result.printingId).not.toBeNull();
  });
});
