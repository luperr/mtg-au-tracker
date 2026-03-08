/**
 * Transform raw Scryfall card objects into clean rows ready for the database.
 *
 * Two things happen here:
 *   1. shouldImport() — decides whether to keep or skip a card
 *   2. transform()    — picks only the fields we need and splits foil/nonfoil
 *                       into separate printing rows
 */

// ─── Raw Scryfall shape ───────────────────────────────────────────────────────
// We only declare the fields we actually use. Scryfall sends ~60 fields per card.

export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  lang: string;
  layout: string;
  digital: boolean;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  legalities?: Record<string, string>;
  set: string;
  set_name: string;
  released_at: string;           // ISO date string e.g. "2022-09-09"
  collector_number: string;
  rarity: string;
  finishes: string[];            // e.g. ["nonfoil", "foil"]
  image_uris?: { normal?: string };
  card_faces?: Array<{           // double-faced cards store images here
    image_uris?: { normal?: string };
  }>;
  scryfall_uri: string;
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
  };
}

// ─── Output shapes ────────────────────────────────────────────────────────────
// These represent the rows we'll insert into the database later.

export interface CardRow {
  id: string;           // oracle_id — one row per unique card name/rules
  name: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string | null;
  colors: string[];
  colorIdentity: string[];
  legalities: Record<string, string>;
}

export interface PrintingRow {
  id: string;           // scryfall card id (+ "_foil" suffix for foil variants)
  cardId: string;       // FK to CardRow.id (oracle_id)
  setCode: string;
  setName: string;
  releasedAt: string;   // ISO date string "YYYY-MM-DD" — when the set was released
  collectorNumber: string;
  rarity: string;
  isFoil: boolean;
  imageUri: string | null;
  scryfallUri: string;
  usdPrice: string | null;   // stored as string to avoid float rounding issues
}

// ─── Layouts we skip entirely ─────────────────────────────────────────────────

const SKIP_LAYOUTS = new Set([
  "token",
  "double_faced_token",
  "art_series",
  "emblem",
  "vanguard",
  "scheme",
  "planar",
]);

// ─── Filter ───────────────────────────────────────────────────────────────────

export function shouldImport(card: ScryfallCard): boolean {
  // Skip digital-only cards (Arena/MTGO exclusives with no paper version)
  if (card.digital) return false;

  // Skip non-English cards — we only want one copy of each printing
  if (card.lang !== "en") return false;

  // Skip tokens, emblems, art cards, etc.
  if (SKIP_LAYOUTS.has(card.layout)) return false;

  // Skip cards without an oracle_id (the 81 reversible_card layout cards)
  if (!card.oracle_id) return false;

  return true;
}

// ─── Transform ────────────────────────────────────────────────────────────────

function getImageUri(card: ScryfallCard): string | null {
  // Normal cards have image_uris at the top level
  if (card.image_uris?.normal) return card.image_uris.normal;
  // Double-faced cards (transform, modal_dfc) store images on each face
  if (card.card_faces?.[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal;
  }
  return null;
}

export function transform(card: ScryfallCard): {
  cardRow: CardRow;
  printingRows: PrintingRow[];
} {
  const cardRow: CardRow = {
    id: card.oracle_id!,
    name: card.name,
    manaCost: card.mana_cost ?? null,
    typeLine: card.type_line ?? "Unknown",
    oracleText: card.oracle_text ?? null,
    colors: card.colors ?? [],
    colorIdentity: card.color_identity ?? [],
    legalities: card.legalities ?? {},
  };

  const imageUri = getImageUri(card);
  const printingRows: PrintingRow[] = [];

  for (const finish of card.finishes) {
    const isFoil = finish === "foil" || finish === "etched";

    // Give foil printings a distinct id so they don't collide with nonfoil
    const printingId = isFoil ? `${card.id}_foil` : card.id;

    const usdPrice = isFoil
      ? (card.prices?.usd_foil ?? null)
      : (card.prices?.usd ?? null);

    printingRows.push({
      id: printingId,
      cardId: card.oracle_id!,
      setCode: card.set,
      setName: card.set_name,
      releasedAt: card.released_at,
      collectorNumber: card.collector_number,
      rarity: card.rarity,
      isFoil,
      imageUri,
      scryfallUri: card.scryfall_uri,
      usdPrice,
    });
  }

  return { cardRow, printingRows };
}
