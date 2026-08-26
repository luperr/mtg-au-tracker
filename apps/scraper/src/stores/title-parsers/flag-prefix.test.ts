import { describe, it, expect } from "vitest";
import { parseFlagPrefixTitle } from "./flag-prefix.js";
import type { ShopifyProduct } from "../shopify-types.js";

// parseFlagPrefixTitle reads only the title; the rest of the product is scaffolding.
const product = (title: string): ShopifyProduct => ({
  id: 1, title, handle: "h", product_type: "Singles", tags: [], options: [], variants: [],
});

// Every fixture below is a real title pulled from the live Storefront API.

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
