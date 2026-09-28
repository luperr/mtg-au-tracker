import { describe, it, expect } from "vitest";
import { parseAllInTitleFormat } from "./all-in-title.js";
import type { ShopifyProduct } from "../shopify-types.js";

const product = (title: string) => ({ title }) as ShopifyProduct;

describe("parseAllInTitleFormat", () => {
  it("parses Format 1", () => {
    expect(parseAllInTitleFormat(product("Strike It Rich (Retro Frame) 12 Foil Uncommon Modern Horizons 2 NM/M")))
      .toEqual({ cardName: "Strike It Rich", collectorNumber: "12", setName: "Modern Horizons 2", titleFoil: true });
  });

  it("parses Format 2", () => {
    expect(parseAllInTitleFormat(product("Shadow of the Second Sun M Modern Horizons 3 70 NM")))
      .toEqual({ cardName: "Shadow of the Second Sun", collectorNumber: "70", setName: "Modern Horizons 3", titleFoil: false });
  });
});
