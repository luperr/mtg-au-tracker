import { sql } from "./client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

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

export type SetPriceTimelinePoint = {
  date: string;
  total_value: string;
  card_count: number;
};

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

export type SymbioticMover = {
  card_id: string;
  name: string;
  slug: string | null;
  image_uri: string | null;
  first_price: string;
  current_price: string;
  pct_change: string;
};

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

// ─── Queries ──────────────────────────────────────────────────────────────────

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
