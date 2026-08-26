/**
 * Nightly market stats computation.
 *
 * Runs after all scrapers (stores + eBay) have completed so that all price
 * data is fresh before we compute. Two operations in order:
 *
 *   1. computeScrymarketPrices() — bulk UPDATE cards.scrymarket_price and
 *      cards.price_trend from current store_prices and price_history. Read by
 *      the search page price + trend badge and the card detail trend badge.
 *
 *   2. refreshSetCardDaily() — incremental fill of set_card_daily, which backs
 *      the card detail price chart.
 *
 * Both store their results in Postgres so the web side is a trivial SELECT
 * against pre-computed values. No runtime aggregation on the web side.
 *
 * computeScrymarketPrices() is CURRENTLY PAUSED — see MARKET_STATS_ENABLED in
 * lib/config.ts. It reads the whole of price_history and saturates the production
 * disks for hours; turning it back on needs it reworked to be incremental first.
 * refreshSetCardDaily() is already written that way, which is why index.ts calls
 * it outside the gate.
 */

import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { MARKET_STATS_ENABLED, SET_CARD_DAILY_RETENTION_DAYS } from "../lib/config.js";
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

// ─── Set card daily ───────────────────────────────────────────────────────────

/**
 * Fill set_card_daily for every price_history date it doesn't already cover.
 *
 * The card detail price chart needs "cheapest non-foil sell price per card per day,
 * per set". price_history has no set_code, so answering that live meant scanning all
 * seven monthly partitions (~18GB) per request. Here we pay for it once per day.
 *
 * Exported and called independently of MARKET_STATS_ENABLED, because unlike
 * computeScrymarketPrices() this pass is incremental: one INSERT per recorded_at,
 * each pruned to a single partition and driven by price_history_recorded_at_idx, so
 * a cold table backfills as a few hundred small queries rather than one multi-hour
 * scan. It is not what saturated the disks, and the card price chart reads the table
 * it maintains — leaving it behind the pause flag is why set_card_daily sat empty in
 * production. The newest date already present is recomputed as well: the nightly run
 * can land while a store scrape is still writing, so yesterday's row set may have
 * grown since we last saw it.
 */
export async function refreshSetCardDaily(): Promise<void> {
  const pending = await db.execute(sql`
    SELECT DISTINCT ph.recorded_at::text AS recorded_at
    FROM price_history ph
    WHERE ph.recorded_at >= COALESCE((SELECT MAX(recorded_at) FROM set_card_daily), '-infinity'::date)
      -- Also bounded by retention, so a first run against an empty table doesn't
      -- spend hours inserting days the prune below would delete on the same pass.
      AND ph.recorded_at >= CURRENT_DATE - ${SET_CARD_DAILY_RETENTION_DAYS}::int
    ORDER BY 1
  `);

  const dates = (pending as unknown as Array<{ recorded_at: string }>)
    .map((row) => row.recorded_at);

  if (dates.length === 0) {
    log.info("set_card_daily is already up to date");
  } else {
    log.info({ dates: dates.length, from: dates[0], to: dates[dates.length - 1] },
      "Refreshing set_card_daily");
  }

  // No early return when there is nothing to insert: the prune below still has to
  // run, or a day with no new dates leaves the tail growing.
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

  // Prune the tail. Without this the table grows by ~29k rows a day forever; it is a
  // derived cache, and price_history still holds everything, so raising the retention
  // and re-running backfills the days again rather than losing them.
  const pruned = await db.execute(sql`
    DELETE FROM set_card_daily
    WHERE recorded_at < CURRENT_DATE - ${SET_CARD_DAILY_RETENTION_DAYS}::int
  `);

  log.info(
    { dates: dates.length, retention_days: SET_CARD_DAILY_RETENTION_DAYS, pruned: pruned.count ?? 0 },
    "set_card_daily refreshed",
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * @param force run even when MARKET_STATS_ENABLED is off. Reserved for the CLI entry
 *   point below — a human running the script by hand has decided to pay the IO cost.
 *   The two automatic callers (the market cron and the tail of the eBay import) leave
 *   it unset so the flag actually pauses them.
 */
export async function computeMarketStats({ force = false } = {}): Promise<void> {
  if (!MARKET_STATS_ENABLED && !force) {
    log.warn(
      "Market stats are paused (MARKET_STATS_ENABLED is not 'true') — skipping. " +
      "cards.scrymarket_price and cards.price_trend will go stale. set_card_daily is " +
      "unaffected: index.ts refreshes it outside this gate.",
    );
    return;
  }

  await computeScrymarketPrices();
  await refreshSetCardDaily();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  computeMarketStats({ force: true })
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, "Market stats computation failed");
      process.exit(1);
    });
}
