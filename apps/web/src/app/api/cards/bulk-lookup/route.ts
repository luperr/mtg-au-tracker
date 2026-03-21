import { NextResponse } from "next/server";
import sql from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Structured card input — set+collector gives an exact Scryfall printing match */
export type BulkLookupInput = {
  name: string;
  setCode?: string;       // e.g. "drc"
  collectorNumber?: string; // e.g. "144"
  qty?: number;           // for display; buy list adds one item per line
};

export type BulkLookupResult = {
  inputName: string;
  qty: number;
  cardId: string | null;
  cardName: string | null;
  imageUri: string | null;
  cheapest: {
    printingId: string;
    setName: string;
    setCode: string;
    rarity: string;
    isFoil: boolean;
    storeId: string;
    storeName: string;
    priceAud: number;
    shippingAud: number | null;
    condition: string | null;
    url: string | null;
  } | null;
};

// ── Shared result row shape from DB ──────────────────────────────────────────

type ResultRow = {
  card_id: string;
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

function rowToResult(inputName: string, qty: number, row: ResultRow): BulkLookupResult {
  return {
    inputName,
    qty,
    cardId: row.card_id,
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

// ── Lookup helpers ────────────────────────────────────────────────────────────

/** Exact match via set code + collector number — the specific printing */
async function lookupBySetCollector(
  inputName: string,
  qty: number,
  setCode: string,
  collectorNumber: string
): Promise<BulkLookupResult> {
  const rows = await sql<ResultRow[]>`
    SELECT
      c.id AS card_id,
      c.name AS card_name,
      (
        SELECT p2.image_uri FROM printings p2
        WHERE p2.card_id = c.id AND p2.image_uri IS NOT NULL AND p2.is_foil = false
        ORDER BY p2.released_at DESC LIMIT 1
      ) AS image_uri,
      p.id AS printing_id,
      p.set_name,
      p.set_code,
      p.rarity,
      p.is_foil,
      s.id AS store_id,
      s.name AS store_name,
      sp.price_aud,
      sp.shipping_aud,
      sp.condition,
      sp.url
    FROM printings p
    JOIN cards c ON c.id = p.card_id
    JOIN store_prices sp ON sp.printing_id = p.id
      AND sp.in_stock = true
      AND sp.price_type = 'sell'
    JOIN stores s ON s.id = sp.store_id
    WHERE LOWER(p.set_code) = ${setCode.toLowerCase()}
      AND p.collector_number = ${collectorNumber}
    ORDER BY sp.price_aud::numeric ASC
    LIMIT 1
  `;

  if (rows.length > 0) return rowToResult(inputName, qty, rows[0]);

  // Specific printing has no price — fall back to cheapest of same card name
  return lookupByName(inputName, qty);
}

/** Name search (ILIKE) — fallback when no set/collector provided */
async function lookupByName(inputName: string, qty: number): Promise<BulkLookupResult> {
  const rows = await sql<ResultRow[]>`
    SELECT
      c.id AS card_id,
      c.name AS card_name,
      (
        SELECT p2.image_uri FROM printings p2
        WHERE p2.card_id = c.id AND p2.image_uri IS NOT NULL AND p2.is_foil = false
        ORDER BY p2.released_at DESC LIMIT 1
      ) AS image_uri,
      p.id AS printing_id,
      p.set_name,
      p.set_code,
      p.rarity,
      p.is_foil,
      s.id AS store_id,
      s.name AS store_name,
      sp.price_aud,
      sp.shipping_aud,
      sp.condition,
      sp.url
    FROM cards c
    JOIN printings p ON p.card_id = c.id
    JOIN store_prices sp ON sp.printing_id = p.id
      AND sp.in_stock = true
      AND sp.price_type = 'sell'
    JOIN stores s ON s.id = sp.store_id
    WHERE c.name ILIKE ${inputName.trim()}
    ORDER BY sp.price_aud::numeric ASC
    LIMIT 1
  `;

  if (rows.length > 0) return rowToResult(inputName, qty, rows[0]);
  return { inputName, qty, cardId: null, cardName: null, imageUri: null, cheapest: null };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Accept either { cards: BulkLookupInput[] } (new) or { names: string[] } (legacy)
  const b = body as Record<string, unknown>;

  let cards: BulkLookupInput[];
  if (Array.isArray(b.cards)) {
    cards = (b.cards as BulkLookupInput[]).slice(0, 200);
  } else if (Array.isArray(b.names)) {
    cards = (b.names as string[])
      .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
      .slice(0, 200)
      .map((name) => ({ name }));
  } else {
    return NextResponse.json({ error: "Expected { cards: BulkLookupInput[] }" }, { status: 400 });
  }

  if (cards.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const results: BulkLookupResult[] = await Promise.all(
    cards.map((card) => {
      const qty = Math.max(1, Math.min(card.qty ?? 1, 99));
      if (card.setCode && card.collectorNumber) {
        return lookupBySetCollector(card.name, qty, card.setCode, card.collectorNumber);
      }
      return lookupByName(card.name, qty);
    })
  );

  return NextResponse.json({ results });
}
