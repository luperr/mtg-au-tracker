import { describe, it, expect } from "vitest";
import {
  isTokenOrEmblem,
  parseSkuData,
  parseProductTitle,
  isSkippedVariant,
  parseAllInTitle,
} from "./shopify.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function product(title: string, product_type = "") {
  return { id: 1, title, handle: "", product_type, tags: [], options: [], variants: [] };
}

// ─── isTokenOrEmblem ──────────────────────────────────────────────────────────

describe("isTokenOrEmblem", () => {
  it("returns false for a normal card", () => {
    expect(isTokenOrEmblem(product("Lightning Bolt"))).toBe(false);
  });

  it("returns true when title contains 'token'", () => {
    expect(isTokenOrEmblem(product("Elemental Token"))).toBe(true);
  });

  it("returns true when title contains 'emblem'", () => {
    expect(isTokenOrEmblem(product("Garruk Emblem"))).toBe(true);
  });

  it("is case-insensitive for token", () => {
    expect(isTokenOrEmblem(product("TOKEN CREATURE"))).toBe(true);
  });

  it("is case-insensitive for emblem", () => {
    expect(isTokenOrEmblem(product("EMBLEM: Liliana"))).toBe(true);
  });

  it("returns true when product_type is 'token'", () => {
    expect(isTokenOrEmblem(product("Llanowar Elves", "token"))).toBe(true);
  });

  it("returns true when product_type is 'Token' (case-insensitive)", () => {
    expect(isTokenOrEmblem(product("Llanowar Elves", "Token"))).toBe(true);
  });

  // DFC regression — the bug we fixed
  it("returns false for DFC card with // in title", () => {
    expect(isTokenOrEmblem(product("Delver of Secrets // Insectile Aberration"))).toBe(false);
  });

  it("returns false for another DFC card", () => {
    expect(isTokenOrEmblem(product("Commit // Memory"))).toBe(false);
  });

  it("returns false for a card whose name contains 'token' as a substring but not a word", () => {
    // 'tokenization' should not match \btoken\b
    expect(isTokenOrEmblem(product("Tokenization"))).toBe(false);
  });
});

// ─── parseSkuData ─────────────────────────────────────────────────────────────

describe("parseSkuData", () => {
  it("returns nulls for null SKU", () => {
    expect(parseSkuData(null)).toEqual({ setCode: null, collectorNumber: null, isFoil: null });
  });

  it("returns nulls for empty string", () => {
    expect(parseSkuData("")).toEqual({ setCode: null, collectorNumber: null, isFoil: null });
  });

  it("returns nulls for undefined", () => {
    expect(parseSkuData(undefined)).toEqual({ setCode: null, collectorNumber: null, isFoil: null });
  });

  // Format A — Good Games / Plenty of Games
  it("parses nonfoil Format A SKU", () => {
    expect(parseSkuData("MOC-381-EN-NF-1")).toEqual({
      setCode: "moc",
      collectorNumber: "381",
      isFoil: false,
    });
  });

  it("parses foil Format A SKU", () => {
    expect(parseSkuData("MOC-381-EN-FO-1")).toEqual({
      setCode: "moc",
      collectorNumber: "381",
      isFoil: true,
    });
  });

  it("parses Format A SKU with letter-suffixed collector number", () => {
    expect(parseSkuData("PTHB-244S-EN-FO-1")).toEqual({
      setCode: "pthb",
      collectorNumber: "244s",
      isFoil: true,
    });
  });

  it("parses DFC collector number (ignores the //NNN part)", () => {
    expect(parseSkuData("MH3-244//244-EN-NF-1")).toEqual({
      setCode: "mh3",
      collectorNumber: "244",
      isFoil: false,
    });
  });

  // Format B — Gameology
  it("parses Format B (Gameology) SKU — isFoil is null (determined from tags)", () => {
    expect(parseSkuData("MTG-TLA-336-01WREUQWQQ")).toEqual({
      setCode: "tla",
      collectorNumber: "336",
      isFoil: null,
    });
  });

  it("returns nulls for unrecognised SKU format", () => {
    expect(parseSkuData("GARBAGE")).toEqual({ setCode: null, collectorNumber: null, isFoil: null });
  });
});

// ─── parseProductTitle ────────────────────────────────────────────────────────

describe("parseProductTitle", () => {
  it("splits on dash separator", () => {
    expect(parseProductTitle("Lightning Bolt - Magic 2010")).toEqual({
      cardName: "Lightning Bolt",
      setName: "Magic 2010",
    });
  });

  it("splits on em-dash", () => {
    expect(parseProductTitle("Dark Confidant – Ravnica")).toEqual({
      cardName: "Dark Confidant",
      setName: "Ravnica",
    });
  });

  it("splits on round bracket", () => {
    expect(parseProductTitle("Dark Confidant (Ravnica: City of Guilds)")).toEqual({
      cardName: "Dark Confidant",
      setName: "Ravnica: City of Guilds",
    });
  });

  it("splits on square bracket", () => {
    expect(parseProductTitle("Tarmogoyf [Future Sight]")).toEqual({
      cardName: "Tarmogoyf",
      setName: "Future Sight",
    });
  });

  it("returns null setName when no separator found", () => {
    expect(parseProductTitle("Thoughtseize")).toEqual({
      cardName: "Thoughtseize",
      setName: null,
    });
  });

  it("handles apostrophes in card name before dash", () => {
    expect(parseProductTitle("Urza's Saga - Legacy")).toEqual({
      cardName: "Urza's Saga",
      setName: "Legacy",
    });
  });
});

// ─── parseAllInTitle ──────────────────────────────────────────────────────────

describe("parseAllInTitle", () => {
  it("parses foil borderless card", () => {
    expect(parseAllInTitle("Zenos yae Galvus (Borderless) 384 Rare FINAL FANTASY Foil NM/M")).toEqual({
      cardName: "Zenos yae Galvus",
      collectorNumber: "384",
      setName: "FINAL FANTASY",
      isFoil: true,
    });
  });

  it("parses non-foil common", () => {
    expect(parseAllInTitle("Lightning Bolt 401 Common Commander Legends NM/M")).toEqual({
      cardName: "Lightning Bolt",
      collectorNumber: "401",
      setName: "Commander Legends",
      isFoil: false,
    });
  });

  it("parses mythic rare", () => {
    expect(parseAllInTitle("Liliana of the Veil 143 Mythic Rare Innistrad: Midnight Hunt NM/M")).toEqual({
      cardName: "Liliana of the Veil",
      collectorNumber: "143",
      setName: "Innistrad: Midnight Hunt",
      isFoil: false,
    });
  });

  it("parses foil without treatment", () => {
    expect(parseAllInTitle("Thoughtseize 228 Rare Theros Foil NM/M")).toEqual({
      cardName: "Thoughtseize",
      collectorNumber: "228",
      setName: "Theros",
      isFoil: true,
    });
  });

  it("returns null metadata when no rarity found", () => {
    const result = parseAllInTitle("Some Unknown Product NM/M");
    expect(result.collectorNumber).toBeNull();
    expect(result.setName).toBeNull();
    expect(result.isFoil).toBe(false);
  });
});

// ─── isSkippedVariant ─────────────────────────────────────────────────────────

describe("isSkippedVariant", () => {
  it("returns false for Near Mint Nonfoil (standard variant)", () => {
    expect(isSkippedVariant("Near Mint Nonfoil")).toBe(false);
  });

  it("returns false for Near Mint Foil (regular foil is not skipped)", () => {
    expect(isSkippedVariant("Near Mint Foil")).toBe(false);
  });

  it("returns true for Extended Art", () => {
    expect(isSkippedVariant("Extended Art")).toBe(true);
  });

  it("returns true for Showcase", () => {
    expect(isSkippedVariant("Showcase")).toBe(true);
  });

  it("returns true for Retro Frame", () => {
    expect(isSkippedVariant("Retro Frame")).toBe(true);
  });

  it("returns true for Serialized", () => {
    expect(isSkippedVariant("Serialized")).toBe(true);
  });

  it("returns true for Anime variant", () => {
    expect(isSkippedVariant("Anime")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSkippedVariant("EXTENDED ART")).toBe(true);
    expect(isSkippedVariant("showcase")).toBe(true);
  });
});
