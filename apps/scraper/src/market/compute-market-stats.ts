/**
 * Nightly market stats computation.
 *
 * Runs after all scrapers (stores + eBay) have completed so that all price
 * data is fresh before we compute. Three operations in order:
 *
 *   1. computeScrymarketPrices() — bulk UPDATE cards.scrymarket_price and
 *      cards.price_trend from current store_prices and price_history.
 *
 *   2. computeMarketMovers() — TRUNCATE + INSERT market_movers for 7/14/30 day
 *      windows (18 rows total). Runs inside one transaction so readers never
 *      see a partial result.
 *
 *   3. updateSetValues() — unchanged logic, moved here from run-all.ts for
 *      cohesion. Updates sets.set_value_aud.
 *
 * All three store their results in Postgres so web API routes are trivial
 * SELECTs against pre-computed values. No runtime aggregation on the web side.
 */

import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { updateSetValues } from "../stores/update-set-values.js";
import { TREND_UP_THRESHOLD, TREND_DOWN_THRESHOLD } from "@mtg-au/shared";

const log = logger.child({ component: "compute-market-stats" });

// ─── Scrymarket prices ────────────────────────────────────────────────────────

/**
 * Bulk UPDATE cards.scrymarket_price + cards.price_trend in a single pass.
 *
 * Algorithm (same logic as the old per-request subquery in searchCards()):
 *   1. Find the cheapest printing per card (by MIN in-stock sell price).
 *   2. Compute PERCENTILE_CONT(0.5) across all stores for that printing.
 *   3. Compare against the most recent price_history entry for trend.
 */
async function computeScrymarketPrices(): Promise<void> {
  log.info("Computing scrymarket prices and trends for all cards");

  await db.execute(sql`
    UPDATE cards
    SET
      scrymarket_price = sub.median_price,
      price_trend      = sub.trend
    FROM (
      WITH cheapest_printing AS (
        SELECT DISTINCT ON (p.card_id)
          p.card_id,
          p.id AS printing_id
        FROM printings p
        JOIN store_prices sp ON sp.printing_id = p.id
          AND sp.in_stock = true
          AND sp.price_type = 'sell'
        GROUP BY p.card_id, p.id
        ORDER BY p.card_id, MIN(sp.price_aud::numeric) ASC
      ),
      median_prices AS (
        SELECT
          cp.card_id,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sp.price_aud::numeric) AS median_price
        FROM cheapest_printing cp
        JOIN store_prices sp ON sp.printing_id = cp.printing_id
          AND sp.in_stock = true
          AND sp.price_type = 'sell'
        GROUP BY cp.card_id
      ),
      hist AS (
        SELECT DISTINCT ON (cp.card_id)
          cp.card_id,
          ph.price_aud::numeric AS hist_price
        FROM cheapest_printing cp
        JOIN price_history ph ON ph.printing_id = cp.printing_id
          AND ph.price_type = 'sell'
        ORDER BY cp.card_id, ph.recorded_at DESC
      )
      SELECT
        mp.card_id,
        mp.median_price,
        CASE
          WHEN h.hist_price IS NULL THEN NULL
          WHEN mp.median_price > h.hist_price * ${TREND_UP_THRESHOLD} THEN 'up'
          WHEN mp.median_price < h.hist_price * ${TREND_DOWN_THRESHOLD} THEN 'down'
          ELSE 'neutral'
        END AS trend
      FROM median_prices mp
      LEFT JOIN hist h ON h.card_id = mp.card_id
    ) sub
    WHERE cards.id = sub.card_id
  `);

  // Null out cards whose prices have gone entirely out of stock
  await db.execute(sql`
    UPDATE cards
    SET scrymarket_price = NULL, price_trend = NULL
    WHERE scrymarket_price IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM store_prices sp
        JOIN printings p ON p.id = sp.printing_id
        WHERE p.card_id = cards.id
          AND sp.in_stock = true
          AND sp.price_type = 'sell'
      )
  `);

  log.info("Scrymarket prices and trends updated");
}

// ─── Market movers ────────────────────────────────────────────────────────────

/**
 * TRUNCATE + INSERT market_movers for all three windows inside one transaction.
 * Produces exactly 18 rows: 3 windows × 2 directions × 3 ranks.
 * Readers always see either the old complete set or the new complete set.
 */
async function computeMarketMovers(): Promise<void> {
  log.info("Computing market movers for 7d / 14d / 30d windows");

  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE market_movers`);

    for (const days of [7, 14, 30]) {
      // Gainers (direction = 'up')
      await tx.execute(sql`
        INSERT INTO market_movers
          (window_days, direction, rank, card_id, set_code, set_name, name, slug, image_uri,
           start_price, current_price, pct_change)
        WITH baseline AS (
          SELECT DISTINCT ON (p.card_id)
            p.card_id,
            ph.price_aud::numeric AS price
          FROM price_history ph
          JOIN printings p ON p.id = ph.printing_id
          WHERE p.is_foil = false
            AND ph.price_type = 'sell'
            AND ph.recorded_at >= NOW() - (${days} * INTERVAL '1 day')
          ORDER BY p.card_id, ph.recorded_at ASC
        ),
        current_price AS (
          SELECT
            p.card_id,
            MIN(sp.price_aud::numeric) AS price,
            (
              SELECT p2.set_code
              FROM store_prices sp2
              JOIN printings p2 ON p2.id = sp2.printing_id
              WHERE p2.card_id = p.card_id
                AND p2.is_foil = false
                AND sp2.in_stock = true
                AND sp2.price_type = 'sell'
              ORDER BY sp2.price_aud ASC
              LIMIT 1
            ) AS set_code
          FROM store_prices sp
          JOIN printings p ON p.id = sp.printing_id
          WHERE p.is_foil = false
            AND sp.in_stock = true
            AND sp.price_type = 'sell'
          GROUP BY p.card_id
        ),
        movers AS (
          SELECT
            cp.set_code,
            b.card_id,
            b.price AS start_price,
            cp.price AS current_price,
            ROUND(((cp.price - b.price) / b.price * 100)::numeric, 1) AS pct_change
          FROM baseline b
          JOIN current_price cp ON cp.card_id = b.card_id
          WHERE b.price >= 2.0
            AND cp.set_code IS NOT NULL
            AND cp.price != b.price
            AND cp.price > b.price
        ),
        ranked AS (
          SELECT
            m.card_id, m.set_code, s.set_name, c.name, c.slug,
            (
              SELECT p2.image_uri FROM printings p2
              WHERE p2.card_id = m.card_id
                AND p2.image_uri IS NOT NULL
                AND p2.is_foil = false
              ORDER BY p2.released_at DESC
              LIMIT 1
            ) AS image_uri,
            m.start_price, m.current_price, m.pct_change,
            ROW_NUMBER() OVER (ORDER BY m.pct_change DESC) AS rn
          FROM movers m
          JOIN cards c ON c.id = m.card_id
          JOIN sets s ON s.set_code = m.set_code
        )
        SELECT
          ${days}, 'up', rn::int, card_id, set_code, set_name, name, slug, image_uri,
          start_price, current_price, pct_change
        FROM ranked
        WHERE rn <= 3
      `);

      // Losers (direction = 'down')
      await tx.execute(sql`
        INSERT INTO market_movers
          (window_days, direction, rank, card_id, set_code, set_name, name, slug, image_uri,
           start_price, current_price, pct_change)
        WITH baseline AS (
          SELECT DISTINCT ON (p.card_id)
            p.card_id,
            ph.price_aud::numeric AS price
          FROM price_history ph
          JOIN printings p ON p.id = ph.printing_id
          WHERE p.is_foil = false
            AND ph.price_type = 'sell'
            AND ph.recorded_at >= NOW() - (${days} * INTERVAL '1 day')
          ORDER BY p.card_id, ph.recorded_at ASC
        ),
        current_price AS (
          SELECT
            p.card_id,
            MIN(sp.price_aud::numeric) AS price,
            (
              SELECT p2.set_code
              FROM store_prices sp2
              JOIN printings p2 ON p2.id = sp2.printing_id
              WHERE p2.card_id = p.card_id
                AND p2.is_foil = false
                AND sp2.in_stock = true
                AND sp2.price_type = 'sell'
              ORDER BY sp2.price_aud ASC
              LIMIT 1
            ) AS set_code
          FROM store_prices sp
          JOIN printings p ON p.id = sp.printing_id
          WHERE p.is_foil = false
            AND sp.in_stock = true
            AND sp.price_type = 'sell'
          GROUP BY p.card_id
        ),
        movers AS (
          SELECT
            cp.set_code,
            b.card_id,
            b.price AS start_price,
            cp.price AS current_price,
            ROUND(((cp.price - b.price) / b.price * 100)::numeric, 1) AS pct_change
          FROM baseline b
          JOIN current_price cp ON cp.card_id = b.card_id
          WHERE b.price >= 2.0
            AND cp.set_code IS NOT NULL
            AND cp.price != b.price
            AND cp.price < b.price
        ),
        ranked AS (
          SELECT
            m.card_id, m.set_code, s.set_name, c.name, c.slug,
            (
              SELECT p2.image_uri FROM printings p2
              WHERE p2.card_id = m.card_id
                AND p2.image_uri IS NOT NULL
                AND p2.is_foil = false
              ORDER BY p2.released_at DESC
              LIMIT 1
            ) AS image_uri,
            m.start_price, m.current_price, m.pct_change,
            ROW_NUMBER() OVER (ORDER BY m.pct_change ASC) AS rn
          FROM movers m
          JOIN cards c ON c.id = m.card_id
          JOIN sets s ON s.set_code = m.set_code
        )
        SELECT
          ${days}, 'down', rn::int, card_id, set_code, set_name, name, slug, image_uri,
          start_price, current_price, pct_change
        FROM ranked
        WHERE rn <= 3
      `);
    }
  });

  log.info("Market movers updated (7d / 14d / 30d)");
}

// ─── Set card daily ───────────────────────────────────────────────────────────

/**
 * Fill set_card_daily for every price_history date it doesn't already cover.
 *
 * The set pages need "cheapest non-foil sell price per card per day, for one set".
 * price_history has no set_code, so answering that live meant scanning all seven
 * monthly partitions (~18GB) per request. Here we pay for it once per day instead.
 *
 * One date per statement, deliberately: each is pruned to a single partition and
 * driven by price_history_recorded_at_idx, so a cold table backfills as a few
 * hundred small queries rather than one multi-hour scan. The newest date already
 * present is recomputed as well — the nightly run can land while a store scrape is
 * still writing, so yesterday's row set may have grown since we last saw it.
 */
async function refreshSetCardDaily(): Promise<void> {
  const pending = await db.execute(sql`
    SELECT DISTINCT ph.recorded_at::text AS recorded_at
    FROM price_history ph
    WHERE ph.recorded_at >= COALESCE((SELECT MAX(recorded_at) FROM set_card_daily), '-infinity'::date)
    ORDER BY 1
  `);

  const dates = (pending as unknown as Array<{ recorded_at: string }>)
    .map((row) => row.recorded_at);
  if (dates.length === 0) {
    log.info("set_card_daily is already up to date");
    return;
  }

  log.info({ dates: dates.length, from: dates[0], to: dates[dates.length - 1] },
    "Refreshing set_card_daily");

  for (const recordedAt of dates) {
    await db.execute(sql`
      INSERT INTO set_card_daily (set_code, card_id, recorded_at, min_price)
      SELECT
        p.set_code,
        p.card_id,
        ph.recorded_at,
        MIN(ph.price_aud::numeric)
      FROM price_history ph
      JOIN printings p ON p.id = ph.printing_id
      JOIN cards c ON c.id = p.card_id
      WHERE ph.recorded_at = ${recordedAt}::date
        AND ph.price_type = 'sell'
        AND p.is_foil = false
        AND c.type_line NOT ILIKE 'Basic Land%'
      GROUP BY p.set_code, p.card_id, ph.recorded_at
      ON CONFLICT (set_code, recorded_at, card_id)
      DO UPDATE SET min_price = EXCLUDED.min_price
    `);
  }

  log.info({ dates: dates.length }, "set_card_daily refreshed");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function computeMarketStats(): Promise<void> {
  await computeScrymarketPrices();
  await computeMarketMovers();
  await refreshSetCardDaily();
  await updateSetValues();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  computeMarketStats()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, "Market stats computation failed");
      process.exit(1);
    });
}
