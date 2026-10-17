import { describe, it, expect } from "vitest";
import { parseSetSlashCollectorTitle } from "./set-slash-collector.js";
import type { ShopifyProduct } from "../shopify-types.js";

// parseSetSlashCollectorTitle reads only the title; the rest of the product is scaffolding.
const product = (title: string): ShopifyProduct => ({
  id: 1, title, handle: "h", product_type: "Instant", tags: [], options: [], variants: [],
});
const parse = (title: string) => {
  const result = parseSetSlashCollectorTitle(product(title));
  expect(result).not.toBeNull();
  return result!;
};

// Fixtures are real titles from the live store, except the padding and digit-led set-code cases.

describe("set-slash-collector (Arcane Alfred)", () => {
  it("reads the set code and collector number after the name", () => {
    expect(parse("Shipwreck Marsh FRA/401")).toMatchObject({
      cardName: "Shipwreck Marsh", setCode: "fra", collectorNumber: "401", setName: null,
    });
  });

  it("keeps a lettered collector number", () => {
    expect(parse("Gorilla Shaman ALL/72a")).toMatchObject({ cardName: "Gorilla Shaman", setCode: "all", collectorNumber: "72a" });
  });

  it("keeps The List's set-prefixed collector number in Scryfall's case", () => {
    expect(parse("Haru-Onna PLST/SOK-132")).toMatchObject({ cardName: "Haru-Onna", setCode: "plst", collectorNumber: "SOK-132" });
  });

  it("keeps parentheses that are part of the card name", () => {
    expect(parse("B.O.B. (Bevy of Beebles) UND/18").cardName).toBe("B.O.B. (Bevy of Beebles)");
  });

  it("reads a set code that starts with a digit", () => {
    expect(parse("Reveillark 2X2/23")).toMatchObject({ setCode: "2x2", collectorNumber: "23" });
  });

  it("unpads a zero-padded collector number", () => {
    expect(parse("Lightning Bolt SLD/0001").collectorNumber).toBe("1");
  });

  it("leaves finish to the variant options", () => {
    expect(parse("Smash 10E/235")).toMatchObject({ titleFoil: null, titleFinish: null, treatment: null });
  });

  it("keeps a collector number carrying a symbol", () => {
    expect(parse("Avatar of Discord PDIS/140★").collectorNumber).toBe("140★");
  });

  it("rejects a title with no set/collector, which is not a single", () => {
    expect(parseSetSlashCollectorTitle(product("Foundations Play Booster"))).toBeNull();
  });
});
