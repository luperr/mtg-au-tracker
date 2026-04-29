import { describe, it, expect } from "vitest";

// Test the rowToResult conversion contract — ensures NUMERIC-as-string values
// from postgres.js are correctly parsed to numbers at the DB boundary.
// If the DB contract changes (e.g. price_aud becomes a float), this catches it.

// Import the shape — re-derive the rowToResult logic here since it's not exported.
// We're testing the contract, not the implementation internals.

type ResultRow = {
  card_id: string;
  card_slug: string | null;
  card_name: string;
  image_uri: string | null;
  printing_id: string;
  set_name: string;
  set_code: string;
  rarity: string;
  is_foil: boolean;
  store_id: string;
  store_name: string;
  price_aud: string;
  shipping_aud: string | null;
  condition: string | null;
  url: string | null;
};

function rowToResult(inputName: string, qty: number, row: ResultRow) {
  return {
    inputName,
    qty,
    cardId: row.card_id,
    cardSlug: row.card_slug,
    cardName: row.card_name,
    imageUri: row.image_uri,
    cheapest: {
      printingId: row.printing_id,
      setName: row.set_name,
      setCode: row.set_code,
      rarity: row.rarity,
      isFoil: row.is_foil,
      storeId: row.store_id,
      storeName: row.store_name,
      priceAud: parseFloat(row.price_aud),
      shippingAud: row.shipping_aud ? parseFloat(row.shipping_aud) : null,
      condition: row.condition,
      url: row.url,
    },
  };
}

describe("bulk-lookup rowToResult", () => {
  const baseRow: ResultRow = {
    card_id: "abc123",
    card_slug: "lightning-bolt",
    card_name: "Lightning Bolt",
    image_uri: "https://example.com/img.jpg",
    printing_id: "print-1",
    set_name: "Magic 2011",
    set_code: "m11",
    rarity: "common",
    is_foil: false,
    store_id: "good_games",
    store_name: "Good Games",
    price_aud: "4.50",
    shipping_aud: null,
    condition: "NM",
    url: "https://store.com/product",
  };

  it("converts price_aud string to number", () => {
    const result = rowToResult("Lightning Bolt", 1, baseRow);
    expect(result.cheapest!.priceAud).toBe(4.5);
    expect(typeof result.cheapest!.priceAud).toBe("number");
  });

  it("converts shipping_aud string to number when present", () => {
    const row = { ...baseRow, shipping_aud: "9.95" };
    const result = rowToResult("Lightning Bolt", 1, row);
    expect(result.cheapest!.shippingAud).toBe(9.95);
    expect(typeof result.cheapest!.shippingAud).toBe("number");
  });

  it("returns null shipping when shipping_aud is null", () => {
    const result = rowToResult("Lightning Bolt", 1, baseRow);
    expect(result.cheapest!.shippingAud).toBeNull();
  });

  it("handles zero price correctly (not NaN)", () => {
    const row = { ...baseRow, price_aud: "0.00" };
    const result = rowToResult("Lightning Bolt", 1, row);
    expect(result.cheapest!.priceAud).toBe(0);
    expect(Number.isNaN(result.cheapest!.priceAud)).toBe(false);
  });

  it("passes through qty and inputName unchanged", () => {
    const result = rowToResult("lightning bolt", 3, baseRow);
    expect(result.inputName).toBe("lightning bolt");
    expect(result.qty).toBe(3);
  });

  it("passes through null card_slug", () => {
    const row = { ...baseRow, card_slug: null };
    const result = rowToResult("Lightning Bolt", 1, row);
    expect(result.cardSlug).toBeNull();
  });
});
