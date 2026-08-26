import { describe, it, expect } from "vitest";
import { parseParenSetCodeTitle } from "./paren-set-code.js";
import { parseFlagPrefixTitle } from "./flag-prefix.js";
import { parseTrailingSetParenTitle } from "./trailing-set-paren.js";
import type { ShopifyProduct } from "../shopify-types.js";

// All three dialects read only the title; the rest of the product is scaffolding.
const product = (title: string): ShopifyProduct => ({
  id: 1, title, handle: "h", product_type: "Singles", tags: [], options: [], variants: [],
});

// Every fixture below is a real title pulled from the store's live Storefront API.

describe("paren-set-code (Spellroo Gaming)", () => {
  it("reads set code and collector from the parenthetical", () => {
    expect(parseParenSetCodeTitle(product("Into the Flood Maw (BLB - 52) - Bloomburrow - Uncommon - Normal")))
      .toMatchObject({ cardName: "Into the Flood Maw", setCode: "blb", collectorNumber: "52", setName: "Bloomburrow" });
  });

  it("does not split inside the set parenthetical, as the standard parser did", () => {
    // The regression this dialect exists for: "Hex Magic (MSH" was the card name.
    expect(parseParenSetCodeTitle(product("Hex Magic (MSH - 133) - Marvel Super Heroes - Uncommon - Normal")).cardName)
      .toBe("Hex Magic");
  });

  it("strips a treatment parenthetical from the card name", () => {
    expect(parseParenSetCodeTitle(product("Chaos Warp (Borderless) (MAR - 69) - Marvel Universe Eternal-Legal - Mythic - Normal")))
      .toMatchObject({ cardName: "Chaos Warp", setCode: "mar", collectorNumber: "69" });
  });

  it("drops the set size from a The List collector number", () => {
    expect(parseParenSetCodeTitle(product("Noble Hierarch (LIST - 151/249) - The List Reprints - Rare - Normal")))
      .toMatchObject({ cardName: "Noble Hierarch", setCode: "list", collectorNumber: "151", setName: "The List Reprints" });
  });

  it("keeps a set name containing a colon intact", () => {
    expect(parseParenSetCodeTitle(product("Sol Ring (SOC - 128) - Commander: Secrets of Strixhaven - Uncommon - Normal")).setName)
      .toBe("Commander: Secrets of Strixhaven");
  });

  it("leaves foil to the per-variant Printing axis", () => {
    // The trailing "- Foil" is the default variant's finish, not the product's.
    expect(parseParenSetCodeTitle(product("Mole Man, Moloid Master (MSH - 177) - Marvel Super Heroes - Rare - Foil")))
      .toMatchObject({ titleFoil: null, titleFinish: null });
  });

  it("falls back to a bare name when there is no set parenthetical", () => {
    expect(parseParenSetCodeTitle(product("Lightning Bolt")))
      .toMatchObject({ cardName: "Lightning Bolt", setCode: null, collectorNumber: null });
  });
});

describe("flag-prefix (Cherry Collectables)", () => {
  // parseFlagPrefixTitle returns null only for playsets; every other fixture parses.
  const parse = (title: string) => {
    const result = parseFlagPrefixTitle(product(title));
    expect(result).not.toBeNull();
    return result!;
  };

  it("strips the [FOIL] flag and reads the set code after the collector number", () => {
    expect(parse("[FOIL] Mountain (Chocobo Track Foil) #481 - LAND FIC - Commander: FINAL FANTASY"))
      .toMatchObject({
        cardName: "Mountain", setCode: "fic", collectorNumber: "481",
        setName: "Commander: FINAL FANTASY", titleFoil: true, titleFinish: "foil",
      });
  });

  it("reads [ EF ] as etched foil", () => {
    expect(parse("[ EF ] [FOIL] Reveillark #0123 - RARE 2X2 - Double Masters 2022"))
      .toMatchObject({ cardName: "Reveillark", setCode: "2x2", collectorNumber: "123", titleFoil: true, titleFinish: "etched" });
  });

  it("reads [ BL ] as a borderless treatment", () => {
    expect(parse("[ BL ] Damnation #0087 - RARE 2X2 - Double Masters 2022"))
      .toMatchObject({ cardName: "Damnation", treatment: "borderless", titleFoil: false, titleFinish: "nonfoil" });
  });

  it("strips a run of leading treatment words off the card name", () => {
    expect(parse("Galaxy Foil Solaflora Intergalactic Icon No 313 - Rare Unfinity"))
      .toMatchObject({ cardName: "Solaflora Intergalactic Icon", collectorNumber: "313", setName: "Unfinity", titleFoil: true });
  });

  it("does not eat a card name that merely starts with a treatment-like word", () => {
    // "art" counts as a treatment only directly after "extended".
    expect(parse("Foil Artful Dodge 042/281 - Common Streets Of New Capenna").cardName)
      .toBe("Artful Dodge");
  });

  it("handles a separator between the treatment block and the name", () => {
    expect(parse("Foil Extended Art - Pursued Whale 351 - Core Set 2021"))
      .toMatchObject({ cardName: "Pursued Whale", collectorNumber: "351", setName: "Core Set 2021", titleFoil: true });
  });

  it("reads a 'No NNN' collector number", () => {
    expect(parse("Fortified Village No 404 - New Capenna Commander"))
      .toMatchObject({ cardName: "Fortified Village", collectorNumber: "404", setName: "New Capenna Commander" });
  });

  it("reads a collector number written with a space before the set size", () => {
    expect(parse("FOIL Rivaz of the Claw 215 /281 - Rare Dominaria United"))
      .toMatchObject({ cardName: "Rivaz of the Claw", collectorNumber: "215", setName: "Dominaria United" });
  });

  it("keeps a DFC card name intact when the collector follows a dash", () => {
    expect(parse("Foil Showcase Voldaren Bloodcaster // Bloodbat Summoner - No 298 Rare Crimson Vow"))
      .toMatchObject({ cardName: "Voldaren Bloodcaster // Bloodbat Summoner", collectorNumber: "298", setName: "Crimson Vow" });
  });

  it("strips a bare trailing collector number", () => {
    expect(parse("Bitterblossom 085/254 - Mythic Ultimate Masters"))
      .toMatchObject({ cardName: "Bitterblossom", collectorNumber: "85", setName: "Ultimate Masters" });
  });

  it("drops a trailing rarity segment from the set tail", () => {
    expect(parse("Foil - Dualcaster Mage 124/332 - Double Masters - Rare"))
      .toMatchObject({ cardName: "Dualcaster Mage", collectorNumber: "124", setName: "Double Masters" });
  });

  it("handles a set code that heads the set-name segment", () => {
    expect(parse("Sketch Kitchen Imp 343 - Showcase Mh2 Modern Horizons 2"))
      .toMatchObject({ cardName: "Kitchen Imp", setCode: "mh2", setName: "Modern Horizons 2" });
  });

  it("does not mistake a leading year for a set code", () => {
    expect(parse("Korvold, Fae-cursed King #6 - 2024 Year of the Dragon Promo"))
      .toMatchObject({ setCode: null, setName: "2024 Year of the Dragon Promo" });
  });

  it("strips a lowercase rarity prefix off the set name", () => {
    expect(parse("Marauding Mako #114 - Rare Aetherdrift"))
      .toMatchObject({ setCode: null, setName: "Aetherdrift" });
  });

  it("keeps a letter-prefixed promo collector number", () => {
    expect(parse("FOIL Angrath, the Flame-Chained - P0006 - Year of the Ox Promo"))
      .toMatchObject({ cardName: "Angrath, the Flame-Chained", collectorNumber: "p6", setName: "Year of the Ox Promo" });
  });

  it("falls back to the dash split when there is no collector number", () => {
    expect(parse("Ragnar - Rare - 1994 Magic the Gathering Legends"))
      .toMatchObject({ cardName: "Ragnar", collectorNumber: null, setName: "1994 Magic the Gathering Legends" });
  });

  it("strips the single-letter variant marker on the APAC land promos", () => {
    expect(parse("(A) Plains - APAC Asia Pacific Lands Red Pack Promo").cardName).toBe("Plains");
  });

  it("skips playset listings, which are priced per four cards", () => {
    expect(parseFlagPrefixTitle(product("Playset 4 4x Foil Gilded Pinions 238/281 - Streets Of New Capenna")))
      .toBeNull();
  });
});

describe("trailing-set-paren (Chromatic Games)", () => {
  it("separates the collector number from the card name", () => {
    // The regression this dialect exists for: the number stayed glued to the name.
    expect(parseTrailingSetParenTitle(product("Karador, Ghost Chieftain 342/451 (Commander Masters)")))
      .toMatchObject({
        cardName: "Karador, Ghost Chieftain", collectorNumber: "342",
        setName: "Commander Masters", titleFoil: false, titleFinish: "nonfoil",
      });
  });

  it("reads the trailing foil suffix rather than treating it as the set", () => {
    expect(parseTrailingSetParenTitle(product("Krosan Tusker 302/451 (Commander Masters)  - Foil")))
      .toMatchObject({ cardName: "Krosan Tusker", setName: "Commander Masters", titleFoil: true, titleFinish: "foil" });
  });

  it("reads an etched foil suffix", () => {
    expect(parseTrailingSetParenTitle(product("Meren of Clan Nel Toth 584 (Commander Masters)  - Etched Foil")))
      .toMatchObject({ collectorNumber: "584", titleFinish: "etched", titleFoil: true });
  });

  it("keeps the collector number for an extended-art printing", () => {
    expect(parseTrailingSetParenTitle(product("Lazotep Sliver 764/451 (Commander Masters)  - Extended Art Foil")))
      .toMatchObject({ cardName: "Lazotep Sliver", collectorNumber: "764", titleFoil: true });
  });

  it("binds to the last number before the set, not the first", () => {
    expect(parseTrailingSetParenTitle(product("Kongming, Sleeping Dragon 2 100/451 (Commander Masters)")).cardName)
      .toBe("Kongming, Sleeping Dragon 2");
  });

  it("falls back to the whole title when the shape does not match", () => {
    expect(parseTrailingSetParenTitle(product("Some Bundle Product")))
      .toMatchObject({ cardName: "Some Bundle Product", collectorNumber: null, setName: null });
  });
});
