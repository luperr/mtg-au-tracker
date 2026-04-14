import { describe, it, expect } from "vitest";
import { shouldImport, transform, type ScryfallCard } from "./transform.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: "abc123",
    oracle_id: "oracle-001",
    name: "Lightning Bolt",
    lang: "en",
    layout: "normal",
    digital: false,
    set: "m10",
    set_name: "Magic 2010",
    released_at: "2009-07-17",
    collector_number: "149",
    rarity: "common",
    finishes: ["nonfoil"],
    image_uris: { normal: "https://cards.scryfall.io/normal/front/abc.jpg" },
    scryfall_uri: "https://scryfall.com/card/m10/149",
    prices: { usd: "0.50", usd_foil: "2.00" },
    ...overrides,
  };
}

// ─── shouldImport ─────────────────────────────────────────────────────────────

describe("shouldImport", () => {
  it("returns true for a standard English paper card", () => {
    expect(shouldImport(baseCard())).toBe(true);
  });

  it("returns false for digital-only cards", () => {
    expect(shouldImport(baseCard({ digital: true }))).toBe(false);
  });

  it("returns false for non-English cards", () => {
    expect(shouldImport(baseCard({ lang: "ja" }))).toBe(false);
    expect(shouldImport(baseCard({ lang: "de" }))).toBe(false);
  });

  it("returns true for English", () => {
    expect(shouldImport(baseCard({ lang: "en" }))).toBe(true);
  });

  it("returns false for token layout", () => {
    expect(shouldImport(baseCard({ layout: "token" }))).toBe(false);
  });

  it("returns false for double_faced_token layout", () => {
    expect(shouldImport(baseCard({ layout: "double_faced_token" }))).toBe(false);
  });

  it("returns false for emblem layout", () => {
    expect(shouldImport(baseCard({ layout: "emblem" }))).toBe(false);
  });

  it("returns false for art_series layout", () => {
    expect(shouldImport(baseCard({ layout: "art_series" }))).toBe(false);
  });

  it("returns false for vanguard layout", () => {
    expect(shouldImport(baseCard({ layout: "vanguard" }))).toBe(false);
  });

  it("returns true for transform (DFC) layout", () => {
    expect(shouldImport(baseCard({ layout: "transform" }))).toBe(true);
  });

  it("returns true for modal_dfc layout", () => {
    expect(shouldImport(baseCard({ layout: "modal_dfc" }))).toBe(true);
  });

  it("returns true for adventure layout", () => {
    expect(shouldImport(baseCard({ layout: "adventure" }))).toBe(true);
  });

  it("returns false when oracle_id is missing (reversible_card)", () => {
    const card = baseCard();
    delete card.oracle_id;
    expect(shouldImport(card)).toBe(false);
  });
});

// ─── transform ────────────────────────────────────────────────────────────────

describe("transform — cardRow", () => {
  it("sets id to oracle_id", () => {
    const { cardRow } = transform(baseCard());
    expect(cardRow.id).toBe("oracle-001");
  });

  it("sets name from card.name", () => {
    const { cardRow } = transform(baseCard({ name: "Dark Confidant" }));
    expect(cardRow.name).toBe("Dark Confidant");
  });

  it("sets manaCost to null when missing", () => {
    const { cardRow } = transform(baseCard({ mana_cost: undefined }));
    expect(cardRow.manaCost).toBeNull();
  });

  it("uses 'Unknown' for typeLine when missing", () => {
    const { cardRow } = transform(baseCard({ type_line: undefined }));
    expect(cardRow.typeLine).toBe("Unknown");
  });
});

describe("transform — printingRows finishes", () => {
  it("produces 1 nonfoil row for finishes: ['nonfoil']", () => {
    const { printingRows } = transform(baseCard({ finishes: ["nonfoil"] }));
    expect(printingRows).toHaveLength(1);
    expect(printingRows[0].isFoil).toBe(false);
    expect(printingRows[0].id).toBe("abc123");
  });

  it("produces 1 foil row with _foil suffix for finishes: ['foil']", () => {
    const { printingRows } = transform(baseCard({ finishes: ["foil"] }));
    expect(printingRows).toHaveLength(1);
    expect(printingRows[0].isFoil).toBe(true);
    expect(printingRows[0].id).toBe("abc123_foil");
  });

  it("produces 2 rows for finishes: ['nonfoil', 'foil']", () => {
    const { printingRows } = transform(baseCard({ finishes: ["nonfoil", "foil"] }));
    expect(printingRows).toHaveLength(2);
    expect(printingRows.some((p) => p.isFoil === false)).toBe(true);
    expect(printingRows.some((p) => p.isFoil === true)).toBe(true);
  });

  it("treats 'etched' finish as foil", () => {
    const { printingRows } = transform(baseCard({ finishes: ["etched"] }));
    expect(printingRows[0].isFoil).toBe(true);
    expect(printingRows[0].id).toBe("abc123_foil");
  });

  it("assigns usd_foil price to foil rows", () => {
    const { printingRows } = transform(
      baseCard({ finishes: ["foil"], prices: { usd: "0.50", usd_foil: "2.00" } })
    );
    expect(printingRows[0].usdPrice).toBe("2.00");
  });

  it("assigns usd price to nonfoil rows", () => {
    const { printingRows } = transform(
      baseCard({ finishes: ["nonfoil"], prices: { usd: "0.50", usd_foil: "2.00" } })
    );
    expect(printingRows[0].usdPrice).toBe("0.50");
  });

  it("sets usdPrice to null when price missing", () => {
    const { printingRows } = transform(baseCard({ finishes: ["nonfoil"], prices: {} }));
    expect(printingRows[0].usdPrice).toBeNull();
  });
});

describe("transform — image URIs", () => {
  it("extracts imageUri from top-level image_uris for normal cards", () => {
    const front = "https://cards.scryfall.io/normal/front/abc.jpg";
    const { printingRows } = transform(baseCard({ image_uris: { normal: front } }));
    expect(printingRows[0].imageUri).toBe(front);
    expect(printingRows[0].imageUriBack).toBeNull();
  });

  it("extracts front and back imageUri for DFC cards", () => {
    const front = "https://cards.scryfall.io/normal/front/dfc.jpg";
    const back = "https://cards.scryfall.io/normal/back/dfc.jpg";
    const { printingRows } = transform(
      baseCard({
        image_uris: undefined,
        card_faces: [
          { image_uris: { normal: front } },
          { image_uris: { normal: back } },
        ],
      })
    );
    expect(printingRows[0].imageUri).toBe(front);
    expect(printingRows[0].imageUriBack).toBe(back);
  });

  it("sets imageUriBack to null for adventure cards (face[1] has no image_uris)", () => {
    const front = "https://cards.scryfall.io/normal/front/adv.jpg";
    const { printingRows } = transform(
      baseCard({
        image_uris: undefined,
        card_faces: [{ image_uris: { normal: front } }, {}],
      })
    );
    expect(printingRows[0].imageUri).toBe(front);
    expect(printingRows[0].imageUriBack).toBeNull();
  });

  it("returns null for both when no image data present", () => {
    const { printingRows } = transform(
      baseCard({ image_uris: undefined, card_faces: undefined })
    );
    expect(printingRows[0].imageUri).toBeNull();
    expect(printingRows[0].imageUriBack).toBeNull();
  });
});
