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
/**
 * One series per set the card was printed in.
 *
 * Was one series per printing, sourced from raw price_history. It is now per-set
 * because that is the grain set_card_daily holds — and the chart already labelled
 * every series with setName, so two printings from one set used to draw two lines
 * carrying the same label. Foils are excluded: set_card_daily filters them at build
 * time to match the set-page queries.
 */
export type SetHistory = {
  setCode: string;
  setName: string;
  data: PriceHistoryPoint[];
};
export type CardPriceHistory = {
  aggregate: PriceHistoryPoint[];
  bySet: SetHistory[];
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

/**
 * Daily total set value (sum of cheapest non-foil price per unique card). Basic lands excluded.
 *
 * Reads set_card_daily, which the nightly market stats task pre-aggregates from
 * price_history. Foils, buylist prices and basic lands are already filtered out
 * there. The inner GROUP BY still collapses per card_id because a card can appear
 * under more than one of the selected set codes (a main set and its extras subset
 * share oracle ids) — taking MIN keeps it counted once, as it was before.
 */
export async function getSetPriceTimeline(setCodes: string[]): Promise<SetPriceTimelinePoint[]> {
  return sql<SetPriceTimelinePoint[]>`
    WITH daily_card_prices AS (
      SELECT
        scd.recorded_at,
        scd.card_id,
        MIN(scd.min_price) AS min_price
      FROM set_card_daily scd
      WHERE scd.set_code = ANY(${setCodes})
      GROUP BY scd.recorded_at, scd.card_id
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
 *
 * The baseline half reads set_card_daily (see getSetPriceTimeline); the current-price
 * half still reads store_prices, which is small and indexed by printing_id.
 */
export async function getSetCardPerformance(setCodes: string[]): Promise<SetCardPerf[]> {
  return sql<SetCardPerf[]>`
    WITH daily_card_prices AS (
      SELECT
        scd.recorded_at,
        scd.card_id,
        MIN(scd.min_price) AS min_price
      FROM set_card_daily scd
      WHERE scd.set_code = ANY(${setCodes})
      GROUP BY scd.recorded_at, scd.card_id
    ),
    first_price AS (
      SELECT DISTINCT ON (card_id)
        card_id,
        min_price AS price
      FROM daily_card_prices
      ORDER BY card_id, recorded_at ASC
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

/**
 * Price history for the card detail chart.
 *
 * Reads set_card_daily, the nightly pre-aggregate, rather than price_history itself.
 * price_history holds one row per printing per store per day — ~89M rows across 19GB
 * of monthly partitions — so drawing ~160 points meant fetching every raw row behind
 * them. Measured on prod for Counterspell (100 printings): 126,262 physical reads and
 * 109s cold, because those rows are scattered and the disks manage ~40 IOPS.
 *
 * set_card_daily already holds the answer at (set_code, card_id, recorded_at) grain,
 * which is why the series are per-set rather than per-printing. `sets` is ~987 rows,
 * so the name join is free.
 */
export async function getCardPriceHistory(cardId: string): Promise<CardPriceHistory> {
  const rows = await sql<{
    set_code: string;
    set_name: string;
    date: string;
    price: string;
  }[]>`
    SELECT
      scd.set_code,
      -- LEFT JOIN: sets and set_card_daily are both filled from the Scryfall import,
      -- so a gap shouldn't happen, but an inner join would silently drop a whole
      -- series from the chart if one ever did.
      COALESCE(s.set_name, scd.set_code) AS set_name,
      scd.recorded_at::text AS date,
      scd.min_price::text AS price
    FROM set_card_daily scd
    LEFT JOIN sets s ON s.set_code = scd.set_code
    WHERE scd.card_id = ${cardId}
    ORDER BY scd.recorded_at, 2
  `;

  // Aggregate: cheapest across every set that day.
  const aggMap = new Map<string, number>();
  for (const row of rows) {
    const p = parseFloat(row.price);
    const existing = aggMap.get(row.date);
    if (existing === undefined || p < existing) aggMap.set(row.date, p);
  }
  const aggregate = Array.from(aggMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, price]) => ({ date, price }));

  const setMap = new Map<string, SetHistory>();
  for (const row of rows) {
    if (!setMap.has(row.set_code)) {
      setMap.set(row.set_code, {
        setCode: row.set_code,
        setName: row.set_name,
        data: [],
      });
    }
    setMap.get(row.set_code)!.data.push({ date: row.date, price: parseFloat(row.price) });
  }
  // A single point draws no line.
  const bySet = Array.from(setMap.values()).filter((p) => p.data.length >= 2);

  return { aggregate, bySet };
}
