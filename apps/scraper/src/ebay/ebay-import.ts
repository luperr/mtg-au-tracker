/**
 * eBay import orchestrator — tiered card-name search with rolling schedule.
 *
 * Each run queries the DB to find which card names are due for a search today,
 * based on three tiers:
 *
 *   Tier 1 (Hot)       released ≤ 30 days ago          → search every 1 day
 *                      zero-result backoff              → 14 days
 *
 *   Tier 2 (Active)    released ≤ 90 days OR USD ≥ $20 → search every 3 days
 *                      zero-result backoff              → 21 days
 *
 *   Tier 3 (Long tail) any age, USD ≥ $2               → search every 7 days
 *                      zero-result backoff              → 30 days
 *
 *   Skip               USD < $2 AND older than 90 days  → never searched
 *
 * For each card searched today:
 *   1. Delete stale eBay store_prices for that card's printings
 *   2. Insert fresh results from eBay
 *   3. Upsert ebay_search_log with today's date + raw result count
 *
 * This rolling approach keeps hot cards fresh daily while spreading the ~5,000
 * API call quota across the full card population over a week.
 */

import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { CardMatcher } from "../matching/card-matcher.js";
import { searchEbayByCardName } from "./browse-client.js";
import { transformEbayItem } from "./transform.js";
import type { EbayItemSummary } from "./browse-client.js";

const STORE_ID = "ebay_au";
const BATCH_SIZE = 500;

// ── Tier config ───────────────────────────────────────────────────────────────

const TIER_LABEL: Record<string, string> = {
  hot: "Tier 1 (Hot, ≤30d)",
  active: "Tier 2 (Active, ≤90d or ≥$20)",
  longTail: "Tier 3 (Long tail, ≥$2)",
};

// ── DB helpers ────────────────────────────────────────────────────────────────

interface CardToSearch {
  cardName: string;
  tier: "hot" | "active" | "longTail";
}

/**
 * Return all card names due for a search today, ordered hot → active → longTail.
 * Uses a two-CTE query:
 *   card_max_usd — aggregates each card's best USD price + most recent release date
 *   card_tiers   — classifies each card into a tier + left-joins search history
 * The WHERE clause applies per-tier schedule and zero-result backoff logic.
 */
async function getCardsToSearch(): Promise<CardToSearch[]> {
  const rows = await db.execute(sql`
    WITH card_max_usd AS (
      SELECT
        c.name AS card_name,
        MAX(p.released_at) AS latest_released,
        MAX(
          CASE WHEN p.usd_price IS NOT NULL AND p.usd_price != ''
               THEN p.usd_price::numeric
               ELSE 0
          END
        ) AS max_usd
      FROM cards c
      JOIN printings p ON c.id = p.card_id
      GROUP BY c.name
    ),
    card_tiers AS (
      SELECT
        cmu.card_name,
        CASE
          WHEN cmu.latest_released >= CURRENT_DATE - INTERVAL '30 days'  THEN 'hot'
          WHEN cmu.latest_released >= CURRENT_DATE - INTERVAL '90 days'
            OR cmu.max_usd >= 20                                          THEN 'active'
          WHEN cmu.max_usd >= 2                                           THEN 'longTail'
          ELSE 'skip'
        END AS tier,
        esl.last_searched_at,
        esl.last_result_count
      FROM card_max_usd cmu
      LEFT JOIN ebay_search_log esl ON esl.card_name = cmu.card_name
    )
    SELECT card_name, tier
    FROM card_tiers
    WHERE tier != 'skip'
      AND CASE tier
        WHEN 'hot' THEN
          last_searched_at IS NULL
          OR (last_result_count > 0 AND last_searched_at < CURRENT_DATE - INTERVAL '1 day')
          OR (last_result_count = 0 AND last_searched_at < CURRENT_DATE - INTERVAL '14 days')
        WHEN 'active' THEN
          last_searched_at IS NULL
          OR (last_result_count > 0 AND last_searched_at < CURRENT_DATE - INTERVAL '3 days')
          OR (last_result_count = 0 AND last_searched_at < CURRENT_DATE - INTERVAL '21 days')
        WHEN 'longTail' THEN
          last_searched_at IS NULL
          OR (last_result_count > 0 AND last_searched_at < CURRENT_DATE - INTERVAL '7 days')
          OR (last_result_count = 0 AND last_searched_at < CURRENT_DATE - INTERVAL '30 days')
        ELSE FALSE
      END
    ORDER BY
      CASE tier WHEN 'hot' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,
      card_name
  `);

  return (rows as unknown as Array<{ card_name: string; tier: string }>).map((r) => ({
    cardName: r.card_name,
    tier: r.tier as "hot" | "active" | "longTail",
  }));
}

/** Delete all eBay store_prices for every printing of the given card name. */
async function clearPricesForCard(cardName: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM store_prices
    WHERE store_id = ${STORE_ID}
      AND printing_id IN (
        SELECT p.id FROM printings p
        JOIN cards c ON p.card_id = c.id
        WHERE c.name = ${cardName}
      )
  `);
}

/** Upsert the search log entry for a card (insert or update on conflict). */
async function upsertSearchLog(cardName: string, resultCount: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await db
    .insert(schema.ebaySearchLog)
    .values({ cardName, lastSearchedAt: today, lastResultCount: resultCount })
    .onConflictDoUpdate({
      target: schema.ebaySearchLog.cardName,
      set: { lastSearchedAt: today, lastResultCount: resultCount },
    });
}

// ── Batch types ───────────────────────────────────────────────────────────────

type PriceRow = typeof schema.storePrices.$inferInsert;
type HistoryRow = typeof schema.priceHistory.$inferInsert;
type UnmatchedRow = typeof schema.unmatchedCards.$inferInsert;

interface Batches {
  prices: PriceRow[];
  history: HistoryRow[];
  unmatched: UnmatchedRow[];
}

async function flushAll(batches: Batches): Promise<void> {
  if (batches.prices.length > 0) {
    await db.insert(schema.storePrices).values(batches.prices);
    batches.prices.length = 0;
  }
  if (batches.history.length > 0) {
    await db.insert(schema.priceHistory).values(batches.history).onConflictDoNothing();
    batches.history.length = 0;
  }
  if (batches.unmatched.length > 0) {
    await db.insert(schema.unmatchedCards).values(batches.unmatched);
    batches.unmatched.length = 0;
  }
}

// ── Per-item processor ────────────────────────────────────────────────────────

interface Stats {
  fetched: number;
  dupes: number;
  skipped: number;
  matched: number;
  unmatched: number;
  cardSearches: number;
  zeroResultCards: number;
}

function processItem(
  item: EbayItemSummary,
  seenIds: Set<string>,
  matcher: CardMatcher,
  batches: Batches,
  stats: Stats,
  today: string,
): void {
  stats.fetched++;

  if (seenIds.has(item.itemId)) {
    stats.dupes++;
    return;
  }
  seenIds.add(item.itemId);

  const card = transformEbayItem(item);
  if (!card) {
    stats.skipped++;
    return;
  }

  const result = matcher.match(card);

  if (result.printingId) {
    batches.prices.push({
      printingId: result.printingId,
      storeId: STORE_ID,
      priceAud: card.price,
      priceType: card.priceType,
      condition: card.condition,
      inStock: card.inStock,
      url: card.sourceUrl,
    });
    batches.history.push({
      printingId: result.printingId,
      storeId: STORE_ID,
      priceAud: card.price,
      priceType: card.priceType,
      recordedAt: today,
    });
    stats.matched++;
  } else {
    batches.unmatched.push({
      storeId: STORE_ID,
      rawName: card.rawName,
      rawSetName: card.setName,
      rawPrice: card.price,
      sourceUrl: card.sourceUrl,
    });
    stats.unmatched++;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runEbayImport(): Promise<void> {
  console.log("[eBay Import] Starting tiered eBay AU price import...");

  const today = new Date().toISOString().slice(0, 10);

  // Build card matcher index once
  console.log("[eBay Import] Building card matcher index...");
  const matcher = new CardMatcher();
  await matcher.build();

  // Determine which cards to search today
  console.log("[eBay Import] Querying cards due for search today...");
  const cardsToSearch = await getCardsToSearch();

  const tierCounts = { hot: 0, active: 0, longTail: 0 };
  for (const { tier } of cardsToSearch) tierCounts[tier]++;

  console.log(`[eBay Import] Cards due today: ${cardsToSearch.length} total`);
  console.log(`  ${TIER_LABEL.hot}:      ${tierCounts.hot}`);
  console.log(`  ${TIER_LABEL.active}:   ${tierCounts.active}`);
  console.log(`  ${TIER_LABEL.longTail}: ${tierCounts.longTail}`);

  if (cardsToSearch.length === 0) {
    console.log("[eBay Import] Nothing to search today — all cards are up to date.");
    return;
  }

  const seenIds = new Set<string>();
  const batches: Batches = { prices: [], history: [], unmatched: [] };
  const stats: Stats = {
    fetched: 0,
    dupes: 0,
    skipped: 0,
    matched: 0,
    unmatched: 0,
    cardSearches: 0,
    zeroResultCards: 0,
  };

  // ── Search each card ───────────────────────────────────────────────────────
  let lastTier = "";
  for (let i = 0; i < cardsToSearch.length; i++) {
    const { cardName, tier } = cardsToSearch[i];

    // Print tier header when tier changes
    if (tier !== lastTier) {
      console.log(`\n[eBay Import] ${TIER_LABEL[tier]}`);
      lastTier = tier;
    }

    if ((i + 1) % 50 === 0 || i === cardsToSearch.length - 1) {
      console.log(
        `[eBay Import] ${i + 1}/${cardsToSearch.length} searched | ` +
        `matched=${stats.matched} unmatched=${stats.unmatched} fetched=${stats.fetched}`,
      );
    }

    let rawCount = 0;
    try {
      // Clear stale prices for this card before inserting fresh ones
      await clearPricesForCard(cardName);

      // Fetch and process eBay results
      for await (const item of searchEbayByCardName(cardName)) {
        rawCount++;
        processItem(item, seenIds, matcher, batches, stats, today);
        if (batches.prices.length >= BATCH_SIZE || batches.unmatched.length >= BATCH_SIZE) {
          await flushAll(batches);
        }
      }
    } catch (err) {
      console.error(`[eBay Import] Error searching "${cardName}":`, err);
      // Don't update search log on error — retry on next run
      continue;
    }

    // Update search log regardless of result count (including zero)
    await upsertSearchLog(cardName, rawCount);
    stats.cardSearches++;
    if (rawCount === 0) stats.zeroResultCards++;
  }

  // Final flush
  await flushAll(batches);

  // ── Summary ───────────────────────────────────────────────────────────────
  const matchPct =
    stats.matched + stats.unmatched > 0
      ? ((stats.matched / (stats.matched + stats.unmatched)) * 100).toFixed(1)
      : "0";

  console.log(`\n[eBay Import] Done.`);
  console.log(`  Cards searched:     ${stats.cardSearches} (${tierCounts.hot} hot, ${tierCounts.active} active, ${tierCounts.longTail} longTail)`);
  console.log(`  Zero-result cards:  ${stats.zeroResultCards} (backed off)`);
  console.log(`  Total fetched:      ${stats.fetched}`);
  console.log(`  Duplicates:         ${stats.dupes}`);
  console.log(`  Skipped:            ${stats.skipped} (sealed, bulk, accessories)`);
  console.log(`  Matched:            ${stats.matched} (${matchPct}%)`);
  console.log(`  Unmatched:          ${stats.unmatched}`);
}

// ── Run directly ──────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runEbayImport()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[eBay Import] Fatal error:", err);
      process.exit(1);
    });
}
