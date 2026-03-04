import { normalizeName } from "@mtg-au/shared";

/**
 * Raw Scryfall card object — we only extract the fields we need.
 * Full spec: https://scryfall.com/docs/api/cards
 */
export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  legalities?: Record<string, string>;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  finishes?: string[];
  image_uris?: { normal?: string; small?: string };
  card_faces?: Array<{
    image_uris?: { normal?: string; small?: string };
  }>;
  scryfall_uri: string;
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    eur?: string | null;
    eur_foil?: string | null;
  };
  // We skip digital-only, tokens, and other non-paper cards
  digital?: boolean;
  layout?: string;
}

/** Card row ready for DB upsert */
export interface CardRow {
  id: string;
  name: string;
  nameNormalized: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string | null;
  colors: string[];
  colorIdentity: string[];
  legalities: Record<string, string>;
  updatedAt: Date;
}

/** Printing row ready for DB upsert */
export interface PrintingRow {
  id: string;
  cardId: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";
  isFoil: boolean;
  imageUri: string | null;
  scryfallUri: string;
  usdPrice: string | null;
  eurPrice: string | null;
  updatedAt: Date;
}

const VALID_RARITIES = new Set([
  "common",
  "uncommon",
  "rare",
  "mythic",
  "special",
  "bonus",
]);

/** Layouts we want to skip entirely */
const SKIP_LAYOUTS = new Set([
  "token",
  "double_faced_token",
  "emblem",
  "art_series",
]);

function normalizeRarity(
  rarity: string
): "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus" {
  if (VALID_RARITIES.has(rarity)) {
    return rarity as "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";
  }
  return "special";
}

function getImageUri(card: ScryfallCard): string | null {
  // Prefer normal image, fall back to small
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.image_uris?.small) return card.image_uris.small;
  // Double-faced cards store images on faces
  if (card.card_faces?.[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal;
  }
  return null;
}

/**
 * Determine if this Scryfall card should be imported.
 * We skip digital-only cards, tokens, emblems, etc.
 */
export function shouldImport(card: ScryfallCard): boolean {
  if (card.digital) return false;
  if (card.layout && SKIP_LAYOUTS.has(card.layout)) return false;
  if (!card.oracle_id) return false;
  return true;
}

/**
 * Transform a Scryfall card object into card + printing rows.
 * A single Scryfall object produces one card row and one or more printing rows
 * (one per finish — foil and non-foil are separate printings).
 */
export function transformScryfallCard(card: ScryfallCard): {
  cardRow: CardRow;
  printingRows: PrintingRow[];
} {
  const now = new Date();

  const cardRow: CardRow = {
    id: card.oracle_id!,
    name: card.name,
    nameNormalized: normalizeName(card.name),
    manaCost: card.mana_cost ?? null,
    typeLine: card.type_line ?? "Unknown",
    oracleText: card.oracle_text ?? null,
    colors: card.colors ?? [],
    colorIdentity: card.color_identity ?? [],
    legalities: card.legalities ?? {},
    updatedAt: now,
  };

  const finishes = card.finishes ?? ["nonfoil"];
  const printingRows: PrintingRow[] = [];

  for (const finish of finishes) {
    const isFoil = finish === "foil" || finish === "etched";

    // Determine price based on finish
    const usdPrice = isFoil
      ? card.prices?.usd_foil ?? null
      : card.prices?.usd ?? null;
    const eurPrice = isFoil
      ? card.prices?.eur_foil ?? null
      : card.prices?.eur ?? null;

    // Use a composite ID for foil variants to keep them distinct
    const printingId = isFoil ? `${card.id}_foil` : card.id;

    printingRows.push({
      id: printingId,
      cardId: card.oracle_id!,
      setCode: card.set,
      setName: card.set_name,
      collectorNumber: card.collector_number,
      rarity: normalizeRarity(card.rarity),
      isFoil,
      imageUri: getImageUri(card),
      scryfallUri: card.scryfall_uri,
      usdPrice,
      eurPrice,
      updatedAt: now,
    });
  }

  return { cardRow, printingRows };
}
