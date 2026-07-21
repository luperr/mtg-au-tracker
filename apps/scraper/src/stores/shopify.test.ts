import { describe, it, expect } from "vitest";
import { isTokenOrEmblem, mapProduct } from "./shopify.js";
import type { ShopifyStoreConfig } from "./stores.config.js";

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

// ─── mapProduct — Mega Games title parsing (exercises the standard-dialect
// dispatch path end-to-end, including tag/SKU foil resolution) ───────────────

const megaConfig: ShopifyStoreConfig = {
  id: "mega_games",
  baseUrl: "https://www.megagames.com.au",
  collectionHandle: "mtg-singles",
};

function megaProduct(title: string, sku: string, tags: string[] = [], available = true) {
  return {
    id: 1,
    title,
    handle: "test",
    product_type: "Single Cards",
    tags,
    options: [{ name: "Title", values: ["Default Title"] }],
    variants: [{ id: 1, title: "Default Title", price: "5.00", sku, available, inventory_quantity: 1, option1: "Default Title", option2: null, option3: null }],
  };
}

describe("mapProduct — Mega Games titles", () => {
  it("extracts card name, set, and collector from standard title with Format C SKU", () => {
    const cards = mapProduct(megaProduct(
      "Prismari Charm (Foil) #0211 M U [SOS]",
      "SOS-U-M-0211-F",
      ["Uncommon", "Foil", "Magic Single Cards", "Secrets of Strixhaven", "SOS"],
    ), megaConfig);
    expect(cards).toHaveLength(1);
    expect(cards[0].rawName).toBe("Prismari Charm");
    expect(cards[0].setCode).toBe("sos");
    expect(cards[0].collectorNumber).toBe("211");
    expect(cards[0].isFoil).toBe(true);
  });

  it("extracts from title when SKU is absent (no-SKU product)", () => {
    const cards = mapProduct(megaProduct(
      "Blazing Firesinger // Seething Song #0109 R U [SOS]",
      "",
      ["Uncommon", "Non-Foil", "Magic Single Cards", "Secrets of Strixhaven", "SOS"],
    ), megaConfig);
    expect(cards).toHaveLength(1);
    expect(cards[0].rawName).toBe("Blazing Firesinger // Seething Song");
    expect(cards[0].setCode).toBe("sos");
    expect(cards[0].collectorNumber).toBe("109");
    expect(cards[0].isFoil).toBe(false);
  });

  it("extracts foil from 'Foil' tag for no-SKU product", () => {
    const cards = mapProduct(megaProduct(
      "Lorehold Charm (Foil) #0200 M U [SOS]",
      "",
      ["Uncommon", "Foil", "Magic Single Cards", "Secrets of Strixhaven", "SOS"],
    ), megaConfig);
    expect(cards).toHaveLength(1);
    expect(cards[0].isFoil).toBe(true);
    expect(cards[0].rawName).toBe("Lorehold Charm");
  });

  it("uses rightmost bracket as set code for two-bracket titles (no-SKU)", () => {
    const cards = mapProduct(megaProduct(
      "Scour for Scrap #0073 Bu U [EOE] [EOS]",
      "",
      ["Uncommon", "Non-Foil", "Magic Single Cards"],
    ), megaConfig);
    expect(cards).toHaveLength(1);
    expect(cards[0].rawName).toBe("Scour for Scrap");
    expect(cards[0].setCode).toBe("eos");
    expect(cards[0].collectorNumber).toBe("73");
  });

  it("uses rightmost bracket as set code for two-bracket titles (with Bu SKU)", () => {
    const cards = mapProduct(megaProduct(
      "Stock Up (Japanese Borderless) #0089 Bu U [SOS] [SOA]",
      "SOA-U-Bu-0089-N",
      ["Uncommon", "Non-Foil", "Magic Single Cards"],
    ), megaConfig);
    expect(cards).toHaveLength(1);
    expect(cards[0].rawName).toBe("Stock Up");
    expect(cards[0].setCode).toBe("soa");
    expect(cards[0].collectorNumber).toBe("89");
    expect(cards[0].isFoil).toBe(false);
  });

  it("strips Borderless parenthetical entirely from card name", () => {
    const cards = mapProduct(megaProduct(
      "Repel Calamity (Japanese Borderless) #0073 W U [SOS] [SOA]",
      "SOA-U-W-0073-N",
      ["Uncommon", "Non-Foil"],
    ), megaConfig);
    expect(cards).toHaveLength(1);
    expect(cards[0].rawName).toBe("Repel Calamity");
  });

  it("handles empty parens in title", () => {
    const cards = mapProduct(megaProduct(
      "Godless Shrine () #0280 L R [EOE]",
      "",
      ["Rare", "Non-Foil"],
    ), megaConfig);
    expect(cards).toHaveLength(1);
    expect(cards[0].rawName).toBe("Godless Shrine");
    expect(cards[0].collectorNumber).toBe("280");
    expect(cards[0].setCode).toBe("eoe");
  });

  it("handles DFC card names", () => {
    const cards = mapProduct(megaProduct(
      "Studious First-Year // Rampant Growth (Foil) #0162 G C [SOS]",
      "SOS-C-G-0162-F",
      ["Common", "Foil"],
    ), megaConfig);
    expect(cards).toHaveLength(1);
    expect(cards[0].rawName).toBe("Studious First-Year // Rampant Growth");
    expect(cards[0].setCode).toBe("sos");
    expect(cards[0].collectorNumber).toBe("162");
    expect(cards[0].isFoil).toBe(true);
  });

  it("full art product with SKU is not skipped (hasSkuMatch overrides isSkippedVariant)", () => {
    const cards = mapProduct(megaProduct(
      "Plains (Full Art) #0267 L C [SOS]",
      "SOS-C-L-0267-N",
      ["Common", "Full Art", "Non-Foil"],
    ), megaConfig);
    expect(cards).toHaveLength(1);
    expect(cards[0].rawName).toBe("Plains");
    expect(cards[0].setCode).toBe("sos");
    expect(cards[0].collectorNumber).toBe("267");
  });
});
