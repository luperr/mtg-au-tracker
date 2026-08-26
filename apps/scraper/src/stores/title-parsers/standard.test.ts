import { describe, it, expect } from "vitest";
import { parseProductTitle, isSkippedVariant, parseStandardTitle } from "./standard.js";
import type { ShopifyProduct } from "../shopify-types.js";

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

// parseStandardTitle takes a whole product, but these title shapes read only the
// title; it returns null solely for unhandled variant types, never for these.
const product = (title: string): ShopifyProduct => ({
  id: 1, title, handle: "h", product_type: "Singles", tags: [], options: [], variants: [],
});
const parseTitle = (title: string) => {
  const result = parseStandardTitle(product(title));
  expect(result).not.toBeNull();
  return result!;
};

describe("parseStandardTitle — round-bracket set+collector (Spellroo Gaming)", () => {
  it("reads set code and collector from the parenthetical", () => {
    expect(parseTitle(("Into the Flood Maw (BLB - 52) - Bloomburrow - Uncommon - Normal")))
      .toMatchObject({ cardName: "Into the Flood Maw", setCode: "blb", collectorNumber: "52", setName: "Bloomburrow" });
  });

  it("does not split inside the set parenthetical, as the standard parser did", () => {
    // The regression this dialect exists for: "Hex Magic (MSH" was the card name.
    expect(parseTitle(("Hex Magic (MSH - 133) - Marvel Super Heroes - Uncommon - Normal")).cardName)
      .toBe("Hex Magic");
  });

  it("strips a treatment parenthetical from the card name", () => {
    expect(parseTitle(("Chaos Warp (Borderless) (MAR - 69) - Marvel Universe Eternal-Legal - Mythic - Normal")))
      .toMatchObject({ cardName: "Chaos Warp", setCode: "mar", collectorNumber: "69" });
  });

  it("drops the set size from a The List collector number", () => {
    expect(parseTitle(("Noble Hierarch (LIST - 151/249) - The List Reprints - Rare - Normal")))
      .toMatchObject({ cardName: "Noble Hierarch", setCode: "list", collectorNumber: "151", setName: "The List Reprints" });
  });

  it("keeps a set name containing a colon intact", () => {
    expect(parseTitle(("Sol Ring (SOC - 128) - Commander: Secrets of Strixhaven - Uncommon - Normal")).setName)
      .toBe("Commander: Secrets of Strixhaven");
  });

  it("leaves foil to the per-variant Printing axis", () => {
    // The trailing "- Foil" is the default variant's finish, not the product's.
    expect(parseTitle(("Mole Man, Moloid Master (MSH - 177) - Marvel Super Heroes - Rare - Foil")))
      .toMatchObject({ titleFinish: null });
  });

  it("falls back to a bare name when there is no set parenthetical", () => {
    expect(parseTitle(("Lightning Bolt")))
      .toMatchObject({ cardName: "Lightning Bolt", setCode: null, collectorNumber: null });
  });
});

describe("parseStandardTitle — collector before a set parenthetical (Chromatic Games)", () => {
  it("separates the collector number from the card name", () => {
    // The regression this dialect exists for: the number stayed glued to the name.
    expect(parseTitle(("Karador, Ghost Chieftain 342/451 (Commander Masters)")))
      .toMatchObject({
        cardName: "Karador, Ghost Chieftain", collectorNumber: "342",
        setName: "Commander Masters", titleFinish: null,
      });
  });

  it("reads the trailing foil suffix rather than treating it as the set", () => {
    expect(parseTitle(("Krosan Tusker 302/451 (Commander Masters)  - Foil")))
      .toMatchObject({ cardName: "Krosan Tusker", setName: "Commander Masters", titleFinish: "foil" });
  });

  it("reads an etched foil suffix", () => {
    expect(parseTitle(("Meren of Clan Nel Toth 584 (Commander Masters)  - Etched Foil")))
      .toMatchObject({ collectorNumber: "584", titleFinish: "etched" });
  });

  it("keeps the collector number for an extended-art printing", () => {
    expect(parseTitle(("Lazotep Sliver 764/451 (Commander Masters)  - Extended Art Foil")))
      .toMatchObject({ cardName: "Lazotep Sliver", collectorNumber: "764", titleFinish: "foil" });
  });

  it("binds to the last number before the set, not the first", () => {
    expect(parseTitle(("Kongming, Sleeping Dragon 2 100/451 (Commander Masters)")).cardName)
      .toBe("Kongming, Sleeping Dragon 2");
  });

  it("falls back to the whole title when the shape does not match", () => {
    expect(parseTitle(("Some Bundle Product")))
      .toMatchObject({ cardName: "Some Bundle Product", collectorNumber: null, setName: null });
  });
});

