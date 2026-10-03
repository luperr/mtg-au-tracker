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
  border_color?: string;         // "black" | "white" | "borderless" | "silver" | "gold"
  frame_effects?: string[];      // ["showcase"] | ["extendedart"] | ["fullart"] | ...
  frame?: string;                // "1993" | "1997" | "2003" | "2015" | "future"
  full_art?: boolean;
  promo_types?: string[];        // ["serialized"] | ["surgefoil"] | ...
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
  finish: "nonfoil" | "foil" | "etched";
  borderColor: string | null;   // Scryfall border_color: "black" | "borderless" | "white" | ...
  frameEffects: string[];       // Scryfall frame_effects: ["showcase"] | ["extendedart"] | []
  frame: string | null;         // Scryfall frame: "1993" | "1997" | "2003" | "2015" | "future"
  fullArt: boolean;
  promoTypes: string[];         // Scryfall promo_types: ["serialized"] | ...
  treatment: Treatment;         // derived — see deriveTreatment()
  imageUri: string | null;
  imageUriBack: string | null;  // back face for DFCs; null for normal cards
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

// ─── Treatment ────────────────────────────────────────────────────────────────

export type Treatment =
  | "serialized" | "borderless" | "showcase" | "extendedart" | "retro" | "fullart" | "normal";

/**
 * The 8th Edition release date — when the modern frame replaced the old one. An old
 * frame on a card printed before this is just that card's frame; after it, it's a
 * deliberate retro treatment (Modern Horizons, Brothers' War retro artifacts, ...).
 */
const MODERN_FRAME_SINCE = "2003-07-28";

/**
 * One label per printing for the search treatment filter. A printing often carries
 * several (a serialized borderless showcase), so this picks by priority — rarest
 * first, which is the one a buyer is actually filtering for. The names match the
 * scraper vocabulary in extractTreatment() so the two can be compared.
 */
export function deriveTreatment(card: Pick<
  ScryfallCard, "promo_types" | "border_color" | "frame_effects" | "frame" | "full_art" | "released_at"
>): Treatment {
  const effects = card.frame_effects ?? [];
  if (card.promo_types?.includes("serialized")) return "serialized";
  if (card.border_color === "borderless") return "borderless";
  if (effects.includes("showcase")) return "showcase";
  if (effects.includes("extendedart")) return "extendedart";
  if ((card.frame === "1993" || card.frame === "1997") && card.released_at >= MODERN_FRAME_SINCE) return "retro";
  if (card.full_art) return "fullart";
  return "normal";
}

// ─── Transform ────────────────────────────────────────────────────────────────

function getImageUris(card: ScryfallCard): { front: string | null; back: string | null } {
  // Normal cards have image_uris at the top level; no back face
  if (card.image_uris?.normal) {
    return { front: card.image_uris.normal, back: null };
  }
  // Double-faced cards (transform, modal_dfc) store images on each face
  return {
    front: card.card_faces?.[0]?.image_uris?.normal ?? null,
    back: card.card_faces?.[1]?.image_uris?.normal ?? null,
  };
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

  const { front: imageUri, back: imageUriBack } = getImageUris(card);
  const printingRows: PrintingRow[] = [];
  const treatment = deriveTreatment(card);

  for (const f of card.finishes) {
    const finish = f as "nonfoil" | "foil" | "etched";
    const isFoil = finish !== "nonfoil";

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
      finish,
      borderColor: card.border_color ?? null,
      frameEffects: card.frame_effects ?? [],
      frame: card.frame ?? null,
      fullArt: card.full_art ?? false,
      promoTypes: card.promo_types ?? [],
      treatment,
      imageUri,
      imageUriBack,
      scryfallUri: card.scryfall_uri,
      usdPrice,
    });
  }

  return { cardRow, printingRows };
}
