/**
 * eBay import orchestrator — hybrid search strategy.
 *
 * Search strategy (in order):
 *   1. Recent sets (within EBAY_RECENT_MONTHS, default 12 months):
 *      Search eBay by each unique card name in those sets.
 *      More targeted — ensures we capture the specific cards people want prices for.
 *
 *   2. High-value cards (usdPrice >= EBAY_HIGH_VALUE_USD, default $10):
 *      Search eBay by card name for any card across all sets worth this much.
 *      Ensures expensive singles in older sets are always tracked.
 *
 *   3. Older sets (outside recent window, no high-value cards):
 *      Search eBay by set name. Broader sweep, 5 pages per set.
 *
 * All three passes deduplicate by eBay item ID in memory.
 * Sets are processed newest-first (by releasedAt DESC).
 *
 * Environment variables:
 *   EBAY_RECENT_MONTHS     — months back to consider "recent" (default: 12)
 *   EBAY_HIGH_VALUE_USD    — USD price threshold for card-name search (default: 10)
 *   EBAY_PAGES_PER_SET     — pages per set-name search (default: 5 = 1,000 items)
 *   EBAY_PAGES_PER_CARD    — pages per card-name search (default: 1 = 200 items)
 */

import { fileURLToPath } from "url";
import { eq, gte, sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { CardMatcher } from "../matching/card-matcher.js";
import { searchEbayBySet, searchEbayByCardName } from "./browse-client.js";
import { transformEbayItem } from "./transform.js";
import type { EbayItemSummary } from "./browse-client.js";

const STORE_ID = "ebay_au";
const BATCH_SIZE = 500;

// ── Config ────────────────────────────────────────────────────────────────────

function getConfig() {
  return {
    recentMonths: parseInt(process.env.EBAY_RECENT_MONTHS ?? "12", 10),
    highValueUsd: parseFloat(process.env.EBAY_HIGH_VALUE_USD ?? "10"),
  };
}

function recentCutoffDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/** All distinct sets, newest first */
async function getAllSets(): Promise<Array<{ setName: string; releasedAt: string }>> {
  const rows = await db.execute(sql`
    SELECT set_name, MAX(released_at) as released_at
    FROM printings
    GROUP BY set_name
    ORDER BY MAX(released_at) DESC
  `);
  return (rows as Array<{ set_name: string; released_at: string }>).map((r) => ({
    setName: r.set_name,
    releasedAt: r.released_at,
  }));
}

/** Unique card names in a set */
async function getCardNamesForSet(setName: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: schema.cards.name })
    .from(schema.printings)
    .innerJoin(schema.cards, eq(schema.printings.cardId, schema.cards.id))
    .where(eq(schema.printings.setName, setName));
  return rows.map((r) => r.name);
}

/** Unique card names where any printing has usdPrice >= threshold, in sets older than cutoff */
async function getHighValueCardNames(
  minUsd: number,
  olderThan: string,
): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT c.name
    FROM printings p
    JOIN cards c ON p.card_id = c.id
    WHERE p.usd_price IS NOT NULL
      AND p.usd_price != ''
      AND p.usd_price::numeric >= ${minUsd}
      AND p.released_at < ${olderThan}
    ORDER BY c.name
  `);
  return (rows as Array<{ name: string }>).map((r) => r.name);
}

// ── Batch flush helpers ───────────────────────────────────────────────────────

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
  console.log("[eBay Import] Starting eBay AU price import...");

  const { recentMonths, highValueUsd } = getConfig();
  const cutoff = recentCutoffDate(recentMonths);
  const today = new Date().toISOString().slice(0, 10);

  console.log(`[eBay Import] Config: recent = last ${recentMonths} months (since ${cutoff}), high-value >= $${highValueUsd} USD`);

  // Build card matcher index
  console.log("[eBay Import] Building card matcher index...");
  const matcher = new CardMatcher();
  await matcher.build();

  // Clear stale data
  console.log("[eBay Import] Clearing existing eBay prices...");
  await db.delete(schema.storePrices).where(eq(schema.storePrices.storeId, STORE_ID));
  await db.delete(schema.unmatchedCards).where(eq(schema.unmatchedCards.storeId, STORE_ID));

  const seenIds = new Set<string>();
  const batches: Batches = { prices: [], history: [], unmatched: [] };
  const stats: Stats = { fetched: 0, dupes: 0, skipped: 0, matched: 0, unmatched: 0 };

  async function processGenerator(gen: AsyncGenerator<EbayItemSummary>): Promise<void> {
    for await (const item of gen) {
      processItem(item, seenIds, matcher, batches, stats, today);
      if (batches.prices.length >= BATCH_SIZE || batches.unmatched.length >= BATCH_SIZE) {
        await flushAll(batches);
      }
    }
  }

  // ── Pass 1: Recent sets — search by card name ──────────────────────────────
  const allSets = await getAllSets();
  const recentSets = allSets.filter((s) => s.releasedAt >= cutoff);
  const olderSets = allSets.filter((s) => s.releasedAt < cutoff);

  console.log(`\n[eBay Import] Pass 1: ${recentSets.length} recent sets → search by card name`);

  // Collect unique card names across all recent sets to avoid redundant searches
  const recentCardNames = new Set<string>();
  for (const { setName } of recentSets) {
    const names = await getCardNamesForSet(setName);
    names.forEach((n) => recentCardNames.add(n));
  }

  console.log(`[eBay Import] ${recentCardNames.size} unique card names in recent sets`);

  let cardIdx = 0;
  for (const cardName of recentCardNames) {
    cardIdx++;
    if (cardIdx % 100 === 0) {
      console.log(`[eBay Import] Pass 1: ${cardIdx}/${recentCardNames.size} cards searched`);
    }
    try {
      await processGenerator(searchEbayByCardName(cardName));
    } catch (err) {
      console.error(`[eBay Import] Error searching card "${cardName}":`, err);
    }
  }

  // ── Pass 2: High-value cards in older sets — search by card name ──────────
  const highValueNames = await getHighValueCardNames(highValueUsd, cutoff);
  console.log(`\n[eBay Import] Pass 2: ${highValueNames.length} high-value cards (>= $${highValueUsd} USD) in older sets → search by card name`);

  let hvIdx = 0;
  for (const cardName of highValueNames) {
    hvIdx++;
    if (hvIdx % 100 === 0) {
      console.log(`[eBay Import] Pass 2: ${hvIdx}/${highValueNames.length} cards searched`);
    }
    try {
      await processGenerator(searchEbayByCardName(cardName));
    } catch (err) {
      console.error(`[eBay Import] Error searching card "${cardName}":`, err);
    }
  }

  // ── Pass 3: Older sets without high-value coverage — search by set name ───
  console.log(`\n[eBay Import] Pass 3: ${olderSets.length} older sets → search by set name`);

  for (let i = 0; i < olderSets.length; i++) {
    const { setName } = olderSets[i];
    if ((i + 1) % 50 === 0) {
      console.log(`[eBay Import] Pass 3: ${i + 1}/${olderSets.length} sets searched`);
    }
    try {
      await processGenerator(searchEbayBySet(setName));
    } catch (err) {
      console.error(`[eBay Import] Error searching set "${setName}":`, err);
    }
  }

  // Final flush
  await flushAll(batches);

  // ── Summary ───────────────────────────────────────────────────────────────
  const matchPct = stats.matched + stats.unmatched > 0
    ? ((stats.matched / (stats.matched + stats.unmatched)) * 100).toFixed(1)
    : "0";

  console.log(`\n[eBay Import] Done.`);
  console.log(`  Recent sets searched by card: ${recentCardNames.size} names`);
  console.log(`  High-value cards searched:    ${highValueNames.length} names`);
  console.log(`  Older sets searched by set:   ${olderSets.length} sets`);
  console.log(`  Total fetched:  ${stats.fetched}`);
  console.log(`  Duplicates:     ${stats.dupes}`);
  console.log(`  Skipped:        ${stats.skipped} (sealed, bulk, accessories)`);
  console.log(`  Matched:        ${stats.matched} (${matchPct}%)`);
  console.log(`  Unmatched:      ${stats.unmatched}`);
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
