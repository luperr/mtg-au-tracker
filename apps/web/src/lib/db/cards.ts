import { sql } from "./client.js";
import { SEARCH_PAGE_SIZE } from "../config.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CardSearchResult = {
  id: string;
  slug: string | null;
  name: string;
  type_line: string;
  colors: string[];
  printing_count: number;
  scrymarket_price: string | null;
  trend: "up" | "down" | "neutral" | null;
  image_uri: string | null;
};

export type CardRow = {
  id: string;
  name: string;
  mana_cost: string | null;
  type_line: string;
  oracle_text: string | null;
  colors: string[];
};

export type PrintingRow = {
  id: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  is_foil: boolean;
  finish: string;
  border_color: string | null;
  frame_effects: string[];
  image_uri: string | null;
  image_uri_back: string | null;
  scryfall_uri: string;
  usd_price: string | null;
  released_at: string | null;
  store_id: string | null;
  store_name: string | null;
  price_aud: string | null;
  shipping_aud: string | null;
  condition: string | null;
  in_stock: boolean | null;
  store_url: string | null;
};

export type CardMetadata = {
  name: string;
  type_line: string;
  cheapest_price: string | null;
  store_count: number;
  cheapest_store: string | null;
  image_uri: string | null;
};

export type StoreRow = {
  id: string;
  name: string;
  base_url: string;
  logo_url: string | null;
};

export type PrintingWithPrices = {
  id: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  isFoil: boolean;
  finish: "nonfoil" | "foil" | "etched";
  borderColor: string | null;
  frameEffects: string[];
  imageUri: string | null;
  imageUriBack: string | null;
  scryfallUri: string;
  usdPrice: string | null;
  releasedAt: string | null;
  prices: {
    storeId: string;
    storeName: string;
    priceAud: string;
    shippingAud: string | null;
    condition: string | null;
    inStock: boolean;
    url: string | null;
  }[];
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export const PAGE_SIZE = SEARCH_PAGE_SIZE;

export async function searchCards(query: string, offset = 0): Promise<CardSearchResult[]> {
  if (!query.trim()) return [];
  // Page the `cards` table on its own first, then look up printing count/art for
  // just those rows. Joining `printings` before the LIMIT made every search seq-scan
  // all ~148k printings, aggregate a ~113k-row join, and spill ~20MB to a disk sort
  // before discarding all but 20 rows.
  return sql<CardSearchResult[]>`
    WITH matched AS (
      SELECT c.id, c.slug, c.name, c.type_line, c.colors, c.scrymarket_price, c.price_trend
      FROM cards c
      WHERE c.name ILIKE ${"%" + query + "%"}
      ORDER BY c.name, c.id
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    )
    SELECT
      m.id,
      m.slug,
      m.name,
      m.type_line,
      m.colors,
      (
        SELECT COUNT(*)::int
        FROM printings p
        WHERE p.card_id = m.id
      ) AS printing_count,
      (
        SELECT p2.image_uri
        FROM printings p2
        WHERE p2.card_id = m.id
          AND p2.image_uri IS NOT NULL
          AND p2.is_foil = false
        ORDER BY p2.released_at DESC
        LIMIT 1
      ) AS image_uri,
      m.scrymarket_price::text AS scrymarket_price,
      m.price_trend AS trend
    FROM matched m
    ORDER BY m.name, m.id
  `;
}

export async function countCards(query: string): Promise<number> {
  if (!query.trim()) return 0;
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM cards WHERE name ILIKE ${"%" + query + "%"}
  `;
  return parseInt(rows[0]?.count ?? "0", 10);
}

export async function getCardTrend(cardId: string): Promise<"up" | "down" | "neutral" | null> {
  const rows = await sql<{ trend: string | null }[]>`
    SELECT price_trend AS trend FROM cards WHERE id = ${cardId}
  `;
  return (rows[0]?.trend ?? null) as "up" | "down" | "neutral" | null;
}

export async function getCard(slug: string): Promise<CardRow | null> {
  const rows = await sql<CardRow[]>`
    SELECT id, name, mana_cost, type_line, oracle_text, colors
    FROM cards
    WHERE slug = ${slug} OR id = ${slug}
  `;
  return rows[0] ?? null;
}

export async function getCardMetadata(slug: string): Promise<CardMetadata | null> {
  const rows = await sql<CardMetadata[]>`
    SELECT
      c.name,
      c.type_line,
      (
        SELECT MIN(sp.price_aud::numeric)::text
        FROM store_prices sp
        JOIN printings p ON p.id = sp.printing_id
        WHERE p.card_id = c.id AND sp.in_stock = true AND sp.price_type = 'sell'
      ) AS cheapest_price,
      (
        SELECT COUNT(DISTINCT sp.store_id)::int
        FROM store_prices sp
        JOIN printings p ON p.id = sp.printing_id
        WHERE p.card_id = c.id AND sp.in_stock = true AND sp.price_type = 'sell'
      ) AS store_count,
      (
        SELECT s.name
        FROM store_prices sp
        JOIN printings p ON p.id = sp.printing_id
        JOIN stores s ON s.id = sp.store_id
        WHERE p.card_id = c.id AND sp.in_stock = true AND sp.price_type = 'sell'
        ORDER BY sp.price_aud::numeric ASC
        LIMIT 1
      ) AS cheapest_store,
      (
        SELECT p.image_uri
        FROM printings p
        WHERE p.card_id = c.id AND p.is_foil = false AND p.image_uri IS NOT NULL
        ORDER BY p.released_at DESC
        LIMIT 1
      ) AS image_uri
    FROM cards c
    WHERE c.slug = ${slug} OR c.id = ${slug}
  `;
  return rows[0] ?? null;
}

export async function getStores(): Promise<StoreRow[]> {
  return sql<StoreRow[]>`
    SELECT id, name, base_url, logo_url
    FROM stores
    WHERE scraper_enabled = true
    ORDER BY
      CASE WHEN id = 'ebay_au' THEN 1 ELSE 0 END,
      name
  `;
}

export async function getCardSlugsForSitemap(): Promise<{ slug: string; updated_at: Date }[]> {
  return sql<{ slug: string; updated_at: Date }[]>`
    SELECT slug, updated_at
    FROM cards
    WHERE slug IS NOT NULL
    ORDER BY name
  `;
}

export async function getPrintingsWithPrices(
  cardId: string
): Promise<PrintingWithPrices[]> {
  const rows = await sql<PrintingRow[]>`
    SELECT
      p.id,
      p.set_code,
      p.set_name,
      p.collector_number,
      p.rarity,
      p.is_foil,
      p.finish,
      p.border_color,
      p.frame_effects,
      p.image_uri,
      p.image_uri_back,
      p.scryfall_uri,
      p.usd_price,
      p.released_at::text AS released_at,
      sp.store_id,
      s.name AS store_name,
      sp.price_aud,
      sp.shipping_aud,
      sp.condition,
      sp.in_stock,
      sp.url AS store_url
    FROM printings p
    LEFT JOIN store_prices sp ON sp.printing_id = p.id
    LEFT JOIN stores s ON s.id = sp.store_id
    WHERE p.card_id = ${cardId}
    ORDER BY p.set_name, p.is_foil, sp.price_aud
  `;

  const map = new Map<string, PrintingWithPrices>();
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        setCode: row.set_code,
        setName: row.set_name,
        collectorNumber: row.collector_number,
        rarity: row.rarity,
        isFoil: row.is_foil,
        finish: (row.finish as "nonfoil" | "foil" | "etched") ?? (row.is_foil ? "foil" : "nonfoil"),
        borderColor: row.border_color ?? null,
        frameEffects: row.frame_effects ?? [],
        imageUri: row.image_uri,
        imageUriBack: row.image_uri_back,
        scryfallUri: row.scryfall_uri,
        usdPrice: row.usd_price,
        releasedAt: row.released_at,
        prices: [],
      });
    }
    if (row.store_id && row.store_name && row.price_aud) {
      map.get(row.id)!.prices.push({
        storeId: row.store_id,
        storeName: row.store_name,
        priceAud: row.price_aud,
        shippingAud: row.shipping_aud ?? null,
        condition: row.condition,
        inStock: row.in_stock ?? false,
        url: row.store_url,
      });
    }
  }
  return Array.from(map.values());
}
