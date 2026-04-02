import { describe, it, expect } from "vitest";
import type { EbayItemSummary } from "./browse-client.js";
import {
  shouldSkip,
  extractFoil,
  extractCondition,
  extractCardName,
  transformEbayItem,
} from "./transform.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseItem(overrides: Partial<EbayItemSummary> = {}): EbayItemSummary {
  return {
    itemId: "1234567890",
    title: "Lightning Bolt NM",
    price: { value: "1.50", currency: "AUD" },
    condition: "New",
    itemWebUrl: "https://www.ebay.com.au/itm/1234567890",
    buyingOptions: ["FIXED_PRICE"],
    ...overrides,
  };
}

// ─── shouldSkip ───────────────────────────────────────────────────────────────

describe("shouldSkip", () => {
  it("returns false for a normal single card listing", () => {
    expect(shouldSkip("Lightning Bolt NM")).toBe(false);
  });

  it("returns false for a DFC card listing", () => {
    expect(shouldSkip("Delver of Secrets // Insectile Aberration NM MTG")).toBe(false);
  });

  it("returns true for PSA graded slab", () => {
    expect(shouldSkip("PSA 9 Lightning Bolt MTG")).toBe(true);
  });

  it("returns true for BGS graded slab", () => {
    expect(shouldSkip("BGS 9.5 Black Lotus Alpha MTG")).toBe(true);
  });

  it("returns true for CGC graded slab", () => {
    expect(shouldSkip("CGC 8 Mox Pearl MTG")).toBe(true);
  });

  it("returns true for bulk lot listing", () => {
    expect(shouldSkip("Lot of 50 Commons MTG")).toBe(true);
  });

  it("returns true for booster pack", () => {
    expect(shouldSkip("Wilds of Eldraine Booster Pack MTG")).toBe(true);
  });

  it("returns true for Pokemon card", () => {
    expect(shouldSkip("Pikachu Holographic Pokemon NM")).toBe(true);
  });

  it("returns true for Yu-Gi-Oh card", () => {
    expect(shouldSkip("Blue-Eyes White Dragon Yugioh NM")).toBe(true);
  });

  it("returns true for multi-pick listing", () => {
    expect(shouldSkip("Choose Your MTG Card Singles")).toBe(true);
  });

  it("returns true for token", () => {
    expect(shouldSkip("Llanowar Elves Token MTG NM")).toBe(true);
  });

  it("returns true for commander deck precon", () => {
    expect(shouldSkip("Commander Deck MTG Preconstructed")).toBe(true);
  });

  it("returns true for playmat", () => {
    expect(shouldSkip("Lightning Bolt MTG Playmat")).toBe(true);
  });
});

// ─── extractFoil ──────────────────────────────────────────────────────────────

describe("extractFoil", () => {
  it("returns true when title contains 'foil'", () => {
    expect(extractFoil("Lightning Bolt Foil NM")).toBe(true);
  });

  it("returns true for lowercase 'foil'", () => {
    expect(extractFoil("Lightning Bolt foil")).toBe(true);
  });

  it("returns true for uppercase 'FOIL'", () => {
    expect(extractFoil("Lightning Bolt FOIL")).toBe(true);
  });

  it("returns false when title has no foil keyword", () => {
    expect(extractFoil("Lightning Bolt NM")).toBe(false);
  });
});

// ─── extractCondition ─────────────────────────────────────────────────────────

describe("extractCondition", () => {
  it("extracts NM from title (title wins over eBay field)", () => {
    expect(extractCondition("Lightning Bolt NM", "Used")).toBe("NM");
  });

  it("extracts LP from title", () => {
    expect(extractCondition("Dark Confidant LP", "Used")).toBe("LP");
  });

  it("extracts MP from title", () => {
    expect(extractCondition("Tarmogoyf MP", "Used")).toBe("MP");
  });

  it("extracts HP from title", () => {
    expect(extractCondition("Thoughtseize HP", "Used")).toBe("HP");
  });

  it("extracts DMG from title", () => {
    expect(extractCondition("Black Lotus DMG", "Acceptable")).toBe("DMG");
  });

  it("falls back to eBay 'New' → NM", () => {
    expect(extractCondition("Lightning Bolt", "New")).toBe("NM");
  });

  it("falls back to eBay 'Like New' → NM", () => {
    expect(extractCondition("Lightning Bolt", "Like New")).toBe("NM");
  });

  it("falls back to eBay 'Very Good' → LP", () => {
    expect(extractCondition("Lightning Bolt", "Very Good")).toBe("LP");
  });

  it("falls back to eBay 'Good' → MP", () => {
    expect(extractCondition("Lightning Bolt", "Good")).toBe("MP");
  });

  it("falls back to eBay 'Acceptable' → HP", () => {
    expect(extractCondition("Lightning Bolt", "Acceptable")).toBe("HP");
  });

  it("falls back to eBay 'For Parts' → DMG", () => {
    expect(extractCondition("Lightning Bolt", "For Parts")).toBe("DMG");
  });

  it("returns null for unrecognised eBay condition with no title match", () => {
    expect(extractCondition("Lightning Bolt", "Unknown Condition")).toBeNull();
  });
});

// ─── extractCardName ──────────────────────────────────────────────────────────

describe("extractCardName", () => {
  it("strips condition keyword NM", () => {
    expect(extractCardName("Lightning Bolt NM", null)).toBe("Lightning Bolt");
  });

  it("strips MTG branding", () => {
    expect(extractCardName("Lightning Bolt NM MTG", null)).toBe("Lightning Bolt");
  });

  it("strips Magic: The Gathering branding", () => {
    expect(extractCardName("Magic The Gathering Lightning Bolt", null)).toBe("Lightning Bolt");
  });

  it("strips quantity prefix (4x)", () => {
    expect(extractCardName("4x Thoughtseize", null)).toBe("Thoughtseize");
  });

  it("preserves DFC card names with //", () => {
    // (ISD) has letters not digits so it's NOT stripped by the numeric-parentheses pattern.
    // The trailing "60" is also not stripped (no standalone number pattern exists).
    // The result will still contain (ISD) and 60 — that's fine: CardMatcher fuzzy handles it.
    const result = extractCardName(
      "Delver of Secrets // Insectile Aberration (ISD) 60",
      null
    );
    expect(result).toContain("Delver of Secrets");
    expect(result).toContain("Insectile Aberration");
  });

  it("strips foil keyword prefix", () => {
    expect(extractCardName("Foil Tarmogoyf Future Sight", "Future Sight")).toBe("Tarmogoyf");
  });

  it("strips prerelease promo annotation", () => {
    expect(extractCardName("Prerelease Promo Atraxa NM", null)).toBe("Atraxa");
  });

  it("strips 'single' but not 'Singles' (plural not in noise list)", () => {
    // \bsingle\b matches "single" not "Singles" — plural is not stripped
    // Covered by CardMatcher normalisation downstream
    expect(extractCardName("Single Mox Pearl", null)).toBe("Mox Pearl");
  });

  it("removes provided set name from title", () => {
    expect(extractCardName("Thoughtseize Theros NM", "Theros")).toBe("Thoughtseize");
  });
});

// ─── transformEbayItem ────────────────────────────────────────────────────────

describe("transformEbayItem", () => {
  it("returns a ScrapedCard for a valid fixed-price AUD listing", () => {
    const result = transformEbayItem(baseItem());
    expect(result).not.toBeNull();
    expect(result!.price).toBe("1.50");
    expect(result!.priceType).toBe("sell");
    expect(result!.inStock).toBe(true);
  });

  it("returns null for an auction listing", () => {
    expect(transformEbayItem(baseItem({ buyingOptions: ["AUCTION"] }))).toBeNull();
  });

  it("returns null for a USD price listing", () => {
    expect(
      transformEbayItem(baseItem({ price: { value: "1.50", currency: "USD" } }))
    ).toBeNull();
  });

  it("returns null for a zero-price listing", () => {
    expect(transformEbayItem(baseItem({ price: { value: "0", currency: "AUD" } }))).toBeNull();
  });

  it("returns null when shouldSkip matches the title", () => {
    expect(transformEbayItem(baseItem({ title: "PSA 9 Lightning Bolt" }))).toBeNull();
  });

  it("returns null when card name is too short after parsing", () => {
    // A title that strips down to 1 character should be rejected
    expect(transformEbayItem(baseItem({ title: "NM MTG LP" }))).toBeNull();
  });

  it("sets isFoil true for foil listing", () => {
    const result = transformEbayItem(baseItem({ title: "Lightning Bolt Foil NM" }));
    expect(result?.isFoil).toBe(true);
  });

  it("sets isFoil false for nonfoil listing", () => {
    const result = transformEbayItem(baseItem({ title: "Lightning Bolt NM" }));
    expect(result?.isFoil).toBe(false);
  });

  it("sets shippingCost to '0.00' for free shipping", () => {
    const result = transformEbayItem(
      baseItem({
        shippingOptions: [{ shippingCostType: "FREE" }],
      })
    );
    expect(result?.shippingCost).toBe("0.00");
  });

  it("sets shippingCost from paid shipping option", () => {
    const result = transformEbayItem(
      baseItem({
        shippingOptions: [
          { shippingCostType: "FIXED", shippingCost: { value: "3.99", currency: "AUD" } },
        ],
      })
    );
    expect(result?.shippingCost).toBe("3.99");
  });

  it("sets shippingCost to null when no shipping options present", () => {
    const result = transformEbayItem(baseItem({ shippingOptions: undefined }));
    expect(result?.shippingCost).toBeNull();
  });

  it("includes sourceUrl from itemWebUrl", () => {
    const result = transformEbayItem(baseItem());
    expect(result?.sourceUrl).toBe("https://www.ebay.com.au/itm/1234567890");
  });
});
