import postgres from "postgres";
import { SEARCH_PAGE_SIZE } from "./config.js";

// Connection is cached at module scope — Next.js may hot-reload in dev,
// so we attach to globalThis to avoid exhausting the connection pool.
declare global {
  // eslint-disable-next-line no-var
  var _pgSql: ReturnType<typeof postgres> | undefined;
}

const sql =
  global._pgSql ??
  (global._pgSql = postgres(process.env.DATABASE_URL!, { max: 5 }));

export default sql;

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

// ─── Queries ──────────────────────────────────────────────────────────────────

export const PAGE_SIZE = SEARCH_PAGE_SIZE;

export async function searchCards(query: string, offset = 0): Promise<CardSearchResult[]> {
  if (!query.trim()) return [];
  return sql<CardSearchResult[]>`
    SELECT
      c.id,
      c.slug,
      c.name,
      c.type_line,
      c.colors,
      COUNT(DISTINCT p.id)::int AS printing_count,
      (
        SELECT p2.image_uri
        FROM printings p2
        WHERE p2.card_id = c.id
          AND p2.image_uri IS NOT NULL
          AND p2.is_foil = false
        ORDER BY p2.released_at DESC
        LIMIT 1
      ) AS image_uri,
      c.scrymarket_price::text AS scrymarket_price,
      c.price_trend AS trend
    FROM cards c
    LEFT JOIN printings p ON p.card_id = c.id
    WHERE c.name ILIKE ${"%" + query + "%"}
    GROUP BY c.id, c.name, c.type_line, c.colors, c.scrymarket_price, c.price_trend
    ORDER BY c.name
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
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

export type CardMetadata = {
  name: string;
  type_line: string;
  cheapest_price: string | null;
  store_count: number;
  cheapest_store: string | null;
  image_uri: string | null;
};

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

export type StoreRow = {
  id: string;
  name: string;
  base_url: string;
  logo_url: string | null;
};

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

// ─── Set queries ─────────────────────────────────────────────────────────────

export type SetSummary = {
  set_code: string;
  set_name: string;
  released_at: string;
  set_type: string | null;
  card_count: number;
  child_types: string | null;   // comma-separated distinct child set_types (excl. tokens)
  set_value_aud: string | null; // pre-computed by scraper after each nightly store run
};

/**
 * Canonical root sets ordered by release date, newest first.
 * Single-table query on `sets` — sub-millisecond. Values are pre-computed by
 * the scraper's updateSetValues() step after each nightly store scrape.
 */
export async function getSetList(yearsBack = 2): Promise<SetSummary[]> {
  return sql<SetSummary[]>`
    SELECT
      s.set_code,
      s.set_name,
      s.released_at::text,
      s.set_type,
      s.card_count,
      s.set_value_aud::text,
      STRING_AGG(DISTINCT c.set_type, ',' ORDER BY c.set_type) AS child_types
    FROM sets s
    LEFT JOIN sets c ON c.parent_set_code = s.set_code
      AND c.set_type IS NOT NULL
      AND c.set_type != 'token'
    WHERE s.parent_set_code IS NULL
      AND (s.set_type IS NULL OR s.set_type = ANY(${CANONICAL_SET_TYPES}))
      AND s.card_count > 20
      AND s.released_at >= CURRENT_DATE - (${yearsBack} * INTERVAL '1 year')
      AND s.released_at <= CURRENT_DATE + INTERVAL '30 days'
    GROUP BY s.set_code, s.set_name, s.released_at, s.set_type, s.card_count, s.set_value_aud
    ORDER BY s.released_at DESC
    LIMIT 100
  `;
}

export type TopMover = {
  card_id: string;
  set_code: string;
  set_name: string;
  name: string;
  slug: string | null;
  image_uri: string | null;
  start_price: string;
  current_price: string;
  pct_change: string;   // positive = up, negative = down
  direction: "up" | "down";
};

/**
 * Top 3 price gainers and top 3 losers for the given window.
 * Results are pre-computed nightly by the market stats task — this is a
 * trivial 18-row lookup on market_movers.
 */
export async function getTopMovers(days: number): Promise<TopMover[]> {
  return sql<TopMover[]>`
    SELECT
      card_id,
      set_code,
      set_name,
      name,
      slug,
      image_uri,
      start_price::text,
      current_price::text,
      pct_change::text,
      direction
    FROM market_movers
    WHERE window_days = ${days}
    ORDER BY direction, rank
  `;
}

export type SetMetadata = {
  set_code: string;
  set_name: string;
  released_at: string;
  unique_cards: number;
  total_printings: number;
  mythic_count: number;
  rare_count: number;
  uncommon_count: number;
  common_count: number;
};

/** Header stats for a single set page. Basic lands excluded. */
export async function getSetMetadata(setCode: string): Promise<SetMetadata | null> {
  const rows = await sql<SetMetadata[]>`
    SELECT
      p.set_code,
      p.set_name,
      MIN(p.released_at)::text AS released_at,
      COUNT(DISTINCT p.card_id)::int AS unique_cards,
      COUNT(*)::int AS total_printings,
      COUNT(*) FILTER (WHERE p.rarity = 'mythic' AND p.is_foil = false)::int AS mythic_count,
      COUNT(*) FILTER (WHERE p.rarity = 'rare' AND p.is_foil = false)::int AS rare_count,
      COUNT(*) FILTER (WHERE p.rarity = 'uncommon' AND p.is_foil = false)::int AS uncommon_count,
      COUNT(*) FILTER (WHERE p.rarity = 'common' AND p.is_foil = false)::int AS common_count
    FROM printings p
    JOIN cards c ON c.id = p.card_id
    WHERE p.set_code = ${setCode}
      AND c.type_line NOT ILIKE 'Basic Land%'
    GROUP BY p.set_code, p.set_name
  `;
  return rows[0] ?? null;
}

export type SetPriceTimelinePoint = {
  date: string;
  total_value: string;
  card_count: number;
};

/** Daily total set value (sum of cheapest non-foil price per unique card). Basic lands excluded. */
export async function getSetPriceTimeline(setCodes: string[]): Promise<SetPriceTimelinePoint[]> {
  return sql<SetPriceTimelinePoint[]>`
    WITH daily_card_prices AS (
      SELECT
        ph.recorded_at,
        p.card_id,
        MIN(ph.price_aud::numeric) AS min_price
      FROM price_history ph
      JOIN printings p ON p.id = ph.printing_id
      JOIN cards c ON c.id = p.card_id
      WHERE p.set_code = ANY(${setCodes})
        AND ph.price_type = 'sell'
        AND p.is_foil = false
        AND c.type_line NOT ILIKE 'Basic Land%'
      GROUP BY ph.recorded_at, p.card_id
    )
    SELECT
      recorded_at::text AS date,
      SUM(min_price)::text AS total_value,
      COUNT(*)::int AS card_count
    FROM daily_card_prices
    GROUP BY recorded_at
    ORDER BY recorded_at
  `;
}

export type SetCardPerf = {
  card_id: string;
  name: string;
  slug: string | null;
  rarity: string;
  image_uri: string | null;
  first_price: string | null;
  current_price: string | null;
  pct_change: string | null;
};

/**
 * Per-card price performance: first recorded price vs current in-stock price.
 * Ordered by pct_change DESC (biggest gainers first). Basic lands excluded.
 */
export async function getSetCardPerformance(setCodes: string[]): Promise<SetCardPerf[]> {
  return sql<SetCardPerf[]>`
    WITH first_seen AS (
      SELECT
        p.card_id,
        MIN(ph.recorded_at) AS first_date
      FROM price_history ph
      JOIN printings p ON p.id = ph.printing_id
      JOIN cards c ON c.id = p.card_id
      WHERE p.set_code = ANY(${setCodes})
        AND ph.price_type = 'sell'
        AND p.is_foil = false
        AND c.type_line NOT ILIKE 'Basic Land%'
      GROUP BY p.card_id
    ),
    first_price AS (
      SELECT
        fs.card_id,
        MIN(ph.price_aud::numeric) AS price
      FROM first_seen fs
      JOIN printings p ON p.card_id = fs.card_id
        AND p.set_code = ANY(${setCodes})
        AND p.is_foil = false
      JOIN price_history ph ON ph.printing_id = p.id
        AND ph.recorded_at = fs.first_date
        AND ph.price_type = 'sell'
      GROUP BY fs.card_id
    ),
    current_price AS (
      SELECT
        p.card_id,
        MIN(sp.price_aud::numeric) AS price
      FROM store_prices sp
      JOIN printings p ON p.id = sp.printing_id
      JOIN cards c ON c.id = p.card_id
      WHERE p.set_code = ANY(${setCodes})
        AND sp.price_type = 'sell'
        AND sp.in_stock = true
        AND p.is_foil = false
        AND c.type_line NOT ILIKE 'Basic Land%'
      GROUP BY p.card_id
    ),
    printing_info AS (
      SELECT DISTINCT ON (p.card_id)
        p.card_id,
        p.rarity,
        p.image_uri
      FROM printings p
      JOIN cards c ON c.id = p.card_id
      WHERE p.set_code = ANY(${setCodes}) AND p.is_foil = false
        AND c.type_line NOT ILIKE 'Basic Land%'
      ORDER BY p.card_id, p.released_at ASC
    )
    SELECT
      c.id AS card_id,
      c.name,
      c.slug,
      pi.rarity,
      pi.image_uri,
      fp.price::text AS first_price,
      cp.price::text AS current_price,
      CASE
        WHEN fp.price > 0
        THEN ROUND(((cp.price - fp.price) / fp.price * 100)::numeric, 1)::text
        ELSE NULL
      END AS pct_change
    FROM first_price fp
    JOIN current_price cp ON cp.card_id = fp.card_id
    JOIN cards c ON c.id = fp.card_id
    JOIN printing_info pi ON pi.card_id = fp.card_id
    ORDER BY
      CASE WHEN fp.price > 0 THEN (cp.price - fp.price) / fp.price END DESC NULLS LAST
  `;
}

export type SetRarityBreakdown = {
  rarity: string;
  card_count: number;
  avg_price: string | null;
  total_value: string | null;
};

/** Value distribution by rarity for in-stock non-foil cards. Basic lands excluded. */
export async function getSetRarityBreakdown(setCodes: string[]): Promise<SetRarityBreakdown[]> {
  return sql<SetRarityBreakdown[]>`
    WITH card_prices AS (
      SELECT
        p.card_id,
        p.rarity,
        MIN(sp.price_aud::numeric) AS min_price
      FROM printings p
      JOIN cards c ON c.id = p.card_id
      JOIN store_prices sp ON sp.printing_id = p.id
      WHERE p.set_code = ANY(${setCodes})
        AND p.is_foil = false
        AND sp.in_stock = true
        AND sp.price_type = 'sell'
        AND c.type_line NOT ILIKE 'Basic Land%'
      GROUP BY p.card_id, p.rarity
    )
    SELECT
      rarity,
      COUNT(*)::int AS card_count,
      AVG(min_price)::text AS avg_price,
      SUM(min_price)::text AS total_value
    FROM card_prices
    GROUP BY rarity
    ORDER BY CASE rarity
      WHEN 'mythic' THEN 1
      WHEN 'rare' THEN 2
      WHEN 'uncommon' THEN 3
      WHEN 'common' THEN 4
      ELSE 5
    END
  `;
}

export type SetStoreComparison = {
  store_id: string;
  store_name: string;
  in_stock_count: number;
  avg_price: string | null;
  unique_cards: number;
};

/** Per-store inventory and price stats for a set. */
export async function getSetStoreComparison(setCode: string): Promise<SetStoreComparison[]> {
  return sql<SetStoreComparison[]>`
    SELECT
      s.id AS store_id,
      s.name AS store_name,
      COUNT(sp.id) FILTER (WHERE sp.in_stock = true)::int AS in_stock_count,
      AVG(sp.price_aud::numeric) FILTER (WHERE sp.in_stock = true)::text AS avg_price,
      COUNT(DISTINCT p.card_id) FILTER (WHERE sp.in_stock = true)::int AS unique_cards
    FROM store_prices sp
    JOIN printings p ON p.id = sp.printing_id
    JOIN stores s ON s.id = sp.store_id
    WHERE p.set_code = ${setCode}
      AND sp.price_type = 'sell'
      AND p.is_foil = false
    GROUP BY s.id, s.name
    HAVING COUNT(sp.id) FILTER (WHERE sp.in_stock = true) > 0
    ORDER BY AVG(sp.price_aud::numeric) FILTER (WHERE sp.in_stock = true) ASC NULLS LAST
  `;
}

export type SetReprintCard = {
  card_id: string;
  name: string;
  slug: string | null;
  rarity: string;
  image_uri: string | null;
  new_printing_price: string | null;
  other_printing_price: string | null;
  pct_diff: string | null;
};

// Set types considered "canonical" for reprint purposes — genuine MTG products
// where a card appearing means it was truly reprinted, not just a same-release
// variant (Secret Lair, promo drop, bonus sheet).
const CANONICAL_SET_TYPES = [
  "expansion", "core", "masters", "draft_innovation", "commander",
  "planechase", "archenemy", "duel_deck", "from_the_vault", "spellbook",
];

/**
 * Cards in this set that are genuine reprints — previously appeared in a
 * canonical product type (expansion, core, masters, etc.) and NOT in a
 * child/sibling release of this same set (Commander decks, promo drops,
 * Secret Lairs sharing this set's parent).
 *
 * Compares this printing's price against the cheapest other qualifying printing.
 */
export async function getSetReprintCards(setCode: string): Promise<SetReprintCard[]> {
  return sql<SetReprintCard[]>`
    WITH this_set_printing AS (
      SELECT DISTINCT ON (p.card_id)
        p.card_id, p.id AS printing_id, p.rarity, p.image_uri
      FROM printings p
      JOIN cards c ON c.id = p.card_id
      WHERE p.set_code = ${setCode} AND p.is_foil = false
        AND c.type_line NOT ILIKE 'Basic Land%'
      ORDER BY p.card_id, p.released_at ASC
    ),
    -- Cards that have a prior printing in a canonical set that is not a
    -- child/sibling of this set's release family.
    reprinted_cards AS (
      SELECT tsp.card_id
      FROM this_set_printing tsp
      WHERE EXISTS (
        SELECT 1
        FROM printings p2
        LEFT JOIN sets s ON s.set_code = p2.set_code
        WHERE p2.card_id = tsp.card_id
          AND p2.set_code != ${setCode}
          AND p2.is_foil = false
          -- Canonical set type, or unknown (NULL) during migration window
          AND (s.set_type IS NULL OR s.set_type = ANY(${CANONICAL_SET_TYPES}))
          -- Not a child of this set (same-release Commander decks, promos, etc.)
          AND (s.parent_set_code IS NULL OR s.parent_set_code != ${setCode})
      )
    ),
    new_printing_price AS (
      SELECT tsp.card_id, MIN(sp.price_aud::numeric) AS price
      FROM this_set_printing tsp
      JOIN reprinted_cards rc ON rc.card_id = tsp.card_id
      JOIN store_prices sp ON sp.printing_id = tsp.printing_id
      WHERE sp.in_stock = true AND sp.price_type = 'sell'
      GROUP BY tsp.card_id
    ),
    other_printing_price AS (
      SELECT p.card_id, MIN(sp.price_aud::numeric) AS price
      FROM printings p
      JOIN reprinted_cards rc ON rc.card_id = p.card_id
      LEFT JOIN sets s ON s.set_code = p.set_code
      JOIN store_prices sp ON sp.printing_id = p.id
      WHERE p.set_code != ${setCode}
        AND p.is_foil = false
        AND (s.set_type IS NULL OR s.set_type = ANY(${CANONICAL_SET_TYPES}))
        AND (s.parent_set_code IS NULL OR s.parent_set_code != ${setCode})
        AND sp.in_stock = true
        AND sp.price_type = 'sell'
      GROUP BY p.card_id
    )
    SELECT
      c.id AS card_id,
      c.name,
      c.slug,
      tsp.rarity,
      tsp.image_uri,
      npp.price::text AS new_printing_price,
      opp.price::text AS other_printing_price,
      CASE
        WHEN opp.price > 0
        THEN ROUND(((npp.price - opp.price) / opp.price * 100)::numeric, 1)::text
        ELSE NULL
      END AS pct_diff
    FROM new_printing_price npp
    JOIN other_printing_price opp ON opp.card_id = npp.card_id
    JOIN cards c ON c.id = npp.card_id
    JOIN this_set_printing tsp ON tsp.card_id = npp.card_id
    ORDER BY ABS(npp.price - opp.price) DESC NULLS LAST
    LIMIT 20
  `;
}

export type SymbioticMover = {
  card_id: string;
  name: string;
  slug: string | null;
  image_uri: string | null;
  first_price: string;
  current_price: string;
  pct_change: string;
};

/**
 * Cards NOT in this set whose price increased ≥15% since the set's release date.
 * Only meaningful for recently released sets — call only when released_at is within 90 days.
 */
export async function getSymbioticMovers(setCode: string, releasedAt: string): Promise<SymbioticMover[]> {
  return sql<SymbioticMover[]>`
    WITH set_card_ids AS (
      SELECT DISTINCT card_id FROM printings WHERE set_code = ${setCode}
    ),
    -- Baseline: prefer first price on or after set release; fall back to oldest price
    -- within a 30-day pre-release window. Scanning only the 30-day pre-release window
    -- keeps query time reasonable (hits 1–2 partitions, not all history).
    first_recorded AS (
      SELECT
        p.card_id,
        COALESCE(
          MIN(ph.recorded_at) FILTER (WHERE ph.recorded_at >= ${releasedAt}::date),
          MIN(ph.recorded_at)
        ) AS first_date
      FROM price_history ph
      JOIN printings p ON p.id = ph.printing_id
      WHERE p.card_id NOT IN (SELECT card_id FROM set_card_ids)
        AND p.is_foil = false
        AND ph.price_type = 'sell'
        AND ph.recorded_at >= ${releasedAt}::date - INTERVAL '30 days'
      GROUP BY p.card_id
    ),
    first_price AS (
      SELECT fr.card_id, MIN(ph.price_aud::numeric) AS price
      FROM first_recorded fr
      JOIN printings p ON p.card_id = fr.card_id AND p.is_foil = false
      JOIN price_history ph ON ph.printing_id = p.id
        AND ph.recorded_at = fr.first_date
        AND ph.price_type = 'sell'
      GROUP BY fr.card_id
    ),
    current_price AS (
      SELECT p.card_id, MIN(sp.price_aud::numeric) AS price
      FROM store_prices sp
      JOIN printings p ON p.id = sp.printing_id
      WHERE p.card_id NOT IN (SELECT card_id FROM set_card_ids)
        AND p.is_foil = false
        AND sp.in_stock = true
        AND sp.price_type = 'sell'
      GROUP BY p.card_id
    )
    SELECT
      c.id AS card_id,
      c.name,
      c.slug,
      (
        SELECT p2.image_uri FROM printings p2
        WHERE p2.card_id = c.id AND p2.image_uri IS NOT NULL AND p2.is_foil = false
        ORDER BY p2.released_at DESC LIMIT 1
      ) AS image_uri,
      fp.price::text AS first_price,
      cp.price::text AS current_price,
      ROUND(((cp.price - fp.price) / fp.price * 100)::numeric, 1)::text AS pct_change
    FROM first_price fp
    JOIN current_price cp ON cp.card_id = fp.card_id
    JOIN cards c ON c.id = fp.card_id
    WHERE fp.price >= 1.0
      AND cp.price > fp.price
      AND (cp.price - fp.price) / fp.price >= 0.15
    ORDER BY (cp.price - fp.price) / fp.price DESC
    LIMIT 15
  `;
}

export type ChildSet = {
  set_code: string;
  set_name: string;
  set_type: string | null;
};

/** Child sets of the given set code (e.g. Commander decks, promo sets, bonus sheets). */
export async function getChildSets(setCode: string): Promise<ChildSet[]> {
  return sql<ChildSet[]>`
    SELECT set_code, set_name, set_type
    FROM sets
    WHERE parent_set_code = ${setCode}
    ORDER BY released_at ASC, set_name ASC
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

export type PriceHistoryPoint = { date: string; price: number };
export type PrintingHistory = {
  printingId: string;
  setName: string;
  setCode: string;
  isFoil: boolean;
  data: PriceHistoryPoint[];
};
export type CardPriceHistory = {
  aggregate: PriceHistoryPoint[];
  byPrinting: PrintingHistory[];
};

export async function getCardPriceHistory(cardId: string): Promise<CardPriceHistory> {
  const rows = await sql<{
    printing_id: string;
    set_name: string;
    set_code: string;
    is_foil: boolean;
    date: string;
    price: string;
  }[]>`
    SELECT
      p.id AS printing_id,
      p.set_name,
      p.set_code,
      p.is_foil,
      ph.recorded_at::text AS date,
      MIN(ph.price_aud::numeric)::text AS price
    FROM price_history ph
    JOIN printings p ON p.id = ph.printing_id
    WHERE p.card_id = ${cardId}
      AND ph.price_type = 'sell'
    GROUP BY p.id, p.set_name, p.set_code, p.is_foil, ph.recorded_at
    ORDER BY ph.recorded_at, p.set_name, p.is_foil
  `;

  // Build aggregate (cheapest across all printings per day)
  const aggMap = new Map<string, number>();
  for (const row of rows) {
    const p = parseFloat(row.price);
    const existing = aggMap.get(row.date);
    if (existing === undefined || p < existing) aggMap.set(row.date, p);
  }
  const aggregate = Array.from(aggMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, price]) => ({ date, price }));

  // Build per-printing
  const printingMap = new Map<string, PrintingHistory>();
  for (const row of rows) {
    if (!printingMap.has(row.printing_id)) {
      printingMap.set(row.printing_id, {
        printingId: row.printing_id,
        setName: row.set_name,
        setCode: row.set_code,
        isFoil: row.is_foil,
        data: [],
      });
    }
    printingMap.get(row.printing_id)!.data.push({ date: row.date, price: parseFloat(row.price) });
  }
  // Only include printings that have at least 2 data points
  const byPrinting = Array.from(printingMap.values()).filter((p) => p.data.length >= 2);

  return { aggregate, byPrinting };
}
