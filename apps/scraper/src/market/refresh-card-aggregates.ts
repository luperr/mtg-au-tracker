/**
 * Denormalised card-row aggregates — the writers for the columns added in migration
 * 0017 (cheapest_price_aud, in_stock_store_count, printing_count, primary_image_uri,
 * facets).
 *
 * Why materialise at all: the database sits on a ZFS mirror of USB spinning disks at
 * ~40 IOPS. Computing "from $X" live costs ~800-1000 random reads per 20-result page,
 * and store_prices is fully rewritten by every scrape, so it is cold every morning
 * with concurrent searchers piling onto the same scattered read — the exact failure
 * mode that made the price chart unusable before set_card_daily. Read off the card row
 * the candidate scan already fetched, it costs zero extra reads, and it also makes
 * in-stock filtering, price faceting and price sorting single-table predicates, which
 * live computation cannot do at any price.
 *
 * Neither pass reads price_history, and neither is gated by MARKET_STATS_ENABLED —
 * same reasoning as refreshSetCardDaily(). Each is one sequential scan plus a hash
 * aggregate to ~33k groups: order of a minute, and sequential throughput is the one
 * thing this disk is good at. The flag exists for computeScrymarketPrices(), which
 * reads all ~18GB of price_history; nothing here does.
 *
 * Two guards, both load-bearing:
 *
 *  - Every UPDATE is qualified with IS DISTINCT FROM, so a night where nothing moved
 *    rewrites no tuples instead of 33k of them. On this disk that is the difference
 *    between a no-op and an hour of vacuum debt.
 *  - Nothing here touches cards.updated_at. The sitemap reads it as <lastmod>
 *    (apps/web/src/app/sitemap.ts), so writing it nightly would churn every URL in
 *    the sitemap every night and teach crawlers to ignore it.
 */

import { sql } from "drizzle-orm";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "refresh-card-aggregates" });

/**
 * cheapest_price_aud + in_stock_store_count, from store_prices.
 *
 * Run at the end of the nightly store scrape, when store_prices has just been
 * rewritten. Nightly is exactly as fresh as the underlying data, since the scrapes
 * are nightly — unlike cards.scrymarket_price, which is stale because its writer is
 * paused rather than because of its cadence.
 *
 * Cards with no in-stock listing anywhere are nulled back, not skipped. The old
 * "out of stock → null the price" cleanup lived inside the paused market-stats pass,
 * which is why cards nobody stocks still show a price and a working add-to-want-list
 * button today. That cleanup lives here now.
 */
export async function refreshCardPrices(): Promise<void> {
  const started = Date.now();

  const result = await db.execute(sql`
    WITH agg AS (
      SELECT
        p.card_id,
        MIN(sp.price_aud::numeric)     AS cheapest,
        COUNT(DISTINCT sp.store_id)::int AS stores
      FROM store_prices sp
      JOIN printings p ON p.id = sp.printing_id
      WHERE sp.price_type = 'sell'
        AND sp.in_stock = true
      GROUP BY p.card_id
    ),
    -- LEFT JOIN rather than filtering to agg: a card that lost its last in-stock
    -- listing has no agg row, and has to be reset rather than left holding
    -- yesterday's price forever.
    target AS (
      SELECT c.id, a.cheapest, COALESCE(a.stores, 0) AS stores
      FROM cards c
      LEFT JOIN agg a ON a.card_id = c.id
    )
    UPDATE cards c
    SET cheapest_price_aud = t.cheapest,
        in_stock_store_count = t.stores
    FROM target t
    WHERE c.id = t.id
      AND (c.cheapest_price_aud IS DISTINCT FROM t.cheapest
        OR c.in_stock_store_count IS DISTINCT FROM t.stores)
  `);

  log.info(
    { rows_changed: result.count ?? 0, duration_ms: Date.now() - started },
    "Refreshed card price aggregates",
  );
}

/**
 * printing_count + primary_image_uri + facets, from printings.
 *
 * Run at the end of the nightly Scryfall import, the only thing that changes
 * printings. Computed in SQL rather than emitted by the importer on purpose: the
 * importer already accumulates every card and printing in memory before writing (the
 * open "batch the upserts" roadmap item), and grouping ~148k printings per card in
 * the same process would raise exactly the heap floor that item exists to lower.
 *
 * Facets are card-grain prefixed tags, so they read as "has a printing that is X".
 * rarity:mythic AND set:mh3 therefore matches a card with some mythic printing and
 * some MH3 printing, not necessarily the same one — the accepted trade for making
 * every facet a single GIN predicate. array_agg(DISTINCT …) sorts its output, so the
 * array is stable between runs and the IS DISTINCT FROM guard actually holds.
 */
export async function refreshCardFacets(): Promise<void> {
  const started = Date.now();

  const result = await db.execute(sql`
    WITH agg AS (
      SELECT
        p.card_id,
        COUNT(*)::int AS printing_count,
        -- Newest non-foil art. FILTER before the subscript so a card whose newest
        -- printing has no image still gets the newest one that does.
        --
        -- p.id is a tiebreaker, not decoration: a set routinely releases several
        -- printings of a card on one date (showcase, borderless, extended art), and
        -- released_at alone leaves the winner to whatever order the scan produced.
        -- That both picks a different image run to run — churning the IS DISTINCT
        -- FROM guard below into a full 33k-row rewrite — and makes the value
        -- untestable, since no query can predict which one it landed on.
        (ARRAY_AGG(p.image_uri ORDER BY p.released_at DESC NULLS LAST, p.id)
           FILTER (WHERE p.image_uri IS NOT NULL AND p.is_foil = false))[1] AS primary_image_uri,
        ARRAY_AGG(DISTINCT 'set:' || lower(p.set_code))
          || ARRAY_AGG(DISTINCT 'rarity:' || lower(p.rarity)) AS printing_facets
      FROM printings p
      GROUP BY p.card_id
    ),
    target AS (
      SELECT
        c.id,
        COALESCE(a.printing_count, 0) AS printing_count,
        a.primary_image_uri,
        COALESCE(a.printing_facets, '{}')
          || CASE
               WHEN cardinality(c.color_identity) = 0 THEN ARRAY['ci:c']
               ELSE ARRAY(SELECT 'ci:' || lower(ci) FROM unnest(c.color_identity) AS ci ORDER BY 1)
             END AS facets
      FROM cards c
      LEFT JOIN agg a ON a.card_id = c.id
    )
    UPDATE cards c
    SET printing_count = t.printing_count,
        primary_image_uri = t.primary_image_uri,
        facets = t.facets
    FROM target t
    WHERE c.id = t.id
      AND (c.printing_count IS DISTINCT FROM t.printing_count
        OR c.primary_image_uri IS DISTINCT FROM t.primary_image_uri
        OR c.facets IS DISTINCT FROM t.facets)
  `);

  log.info(
    { rows_changed: result.count ?? 0, duration_ms: Date.now() - started },
    "Refreshed card facet aggregates",
  );
}

/** Both passes. Used by the CLI entry point and by a first-run backfill. */
export async function refreshCardAggregates(): Promise<void> {
  await refreshCardFacets();
  await refreshCardPrices();
}
