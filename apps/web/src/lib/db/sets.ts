import { sql } from "./client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SetSummary = {
  set_code: string;
  set_name: string;
  released_at: string;
  set_type: string | null;
  card_count: number;
  child_types: string | null;   // comma-separated distinct child set_types (excl. tokens)
  set_value_aud: string | null; // pre-computed by scraper after each nightly store run
};

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

export type SetRarityBreakdown = {
  rarity: string;
  card_count: number;
  avg_price: string | null;
  total_value: string | null;
};

export type SetStoreComparison = {
  store_id: string;
  store_name: string;
  in_stock_count: number;
  avg_price: string | null;
  unique_cards: number;
};

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

export type ChildSet = {
  set_code: string;
  set_name: string;
  set_type: string | null;
};

// Set types considered "canonical" for reprint purposes — genuine MTG products
// where a card appearing means it was truly reprinted, not just a same-release
// variant (Secret Lair, promo drop, bonus sheet).
const CANONICAL_SET_TYPES = [
  "expansion", "core", "masters", "draft_innovation", "commander",
  "planechase", "archenemy", "duel_deck", "from_the_vault", "spellbook",
];

// ─── Queries ──────────────────────────────────────────────────────────────────

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

/** Child sets of the given set code (e.g. Commander decks, promo sets, bonus sheets). */
export async function getChildSets(setCode: string): Promise<ChildSet[]> {
  return sql<ChildSet[]>`
    SELECT set_code, set_name, set_type
    FROM sets
    WHERE parent_set_code = ${setCode}
    ORDER BY released_at ASC, set_name ASC
  `;
}
