/**
 * Store scraper orchestrator.
 *
 * For each store with scraperEnabled = true:
 *   1. Build the in-memory card matching index (once, shared across all stores)
 *   2. Delete existing store_prices and unmatched_cards for this store
 *   3. Run the store's scraper (async generator)
 *   4. Match each ScrapedCard to a Scryfall printing
 *   5. Bulk-insert matched prices into store_prices
 *   6. Upsert today's snapshot into price_history (insert, on conflict do nothing)
 *   7. Log unmatched cards to unmatched_cards for review
 *
 * Run manually:
 *   docker compose run --rm dev pnpm --filter @mtg-au/scraper scrape:stores
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { CardMatcher } from "../matching/card-matcher.js";
import { MtgMateScraper } from "./mtgmate.js";
import type { BaseScraper } from "./base-scraper.js";
import type { ScrapedCard } from "@mtg-au/shared";

// ── Scraper registry ──────────────────────────────────────────────────────────
// Add new scrapers here as they are built.
const SCRAPERS: Record<string, () => BaseScraper> = {
  mtg_mate: () => new MtgMateScraper(),
};

// Batch size for DB inserts — keeps memory bounded and avoids huge single queries
const BATCH_SIZE = 500;

// ── Per-store run ─────────────────────────────────────────────────────────────

async function runStore(
  storeId: string,
  scraper: BaseScraper,
  matcher: CardMatcher,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  console.log(`\n[run-all] ── ${storeId} ──`);

  // Clear stale data from previous runs
  await db.delete(schema.storePrices).where(eq(schema.storePrices.storeId, storeId));
  await db.delete(schema.unmatchedCards).where(eq(schema.unmatchedCards.storeId, storeId));
  console.log(`[run-all] Cleared existing prices and unmatched cards for ${storeId}`);

  type PriceRow = typeof schema.storePrices.$inferInsert;
  type HistoryRow = typeof schema.priceHistory.$inferInsert;
  type UnmatchedRow = typeof schema.unmatchedCards.$inferInsert;

  const priceBatch: PriceRow[] = [];
  const historyBatch: HistoryRow[] = [];
  const unmatchedBatch: UnmatchedRow[] = [];

  let matched = 0;
  let unmatched = 0;
  let total = 0;

  async function flushPrices(): Promise<void> {
    if (priceBatch.length === 0) return;
    await db.insert(schema.storePrices).values(priceBatch);
    priceBatch.length = 0;
  }

  async function flushHistory(): Promise<void> {
    if (historyBatch.length === 0) return;
    await db.insert(schema.priceHistory).values(historyBatch).onConflictDoNothing();
    historyBatch.length = 0;
  }

  for await (const card of scraper.scrapeAll()) {
    total++;
    const result = matcher.match(card);

    if (result.printingId) {
      priceBatch.push(buildPriceRow(storeId, card, result.printingId));
      historyBatch.push(buildHistoryRow(storeId, card, result.printingId, today));
      matched++;
    } else {
      unmatchedBatch.push(buildUnmatchedRow(storeId, card));
      unmatched++;
    }

    // Flush price and history batches together to keep them in sync
    if (priceBatch.length >= BATCH_SIZE) {
      await flushPrices();
      await flushHistory();
    }
  }

  // Final flush
  await flushPrices();
  await flushHistory();

  if (unmatchedBatch.length > 0) {
    await db.insert(schema.unmatchedCards).values(unmatchedBatch);
  }

  const matchPct = total > 0 ? ((matched / total) * 100).toFixed(1) : "0";
  console.log(
    `[run-all] ${storeId}: ${total} scraped — ${matched} matched (${matchPct}%), ${unmatched} unmatched`,
  );
}

// ── Row builders ──────────────────────────────────────────────────────────────

function buildPriceRow(
  storeId: string,
  card: ScrapedCard,
  printingId: string,
): typeof schema.storePrices.$inferInsert {
  return {
    printingId,
    storeId,
    priceAud: card.price,
    priceType: card.priceType,
    condition: card.condition,
    inStock: card.inStock,
    url: card.sourceUrl,
  };
}

function buildHistoryRow(
  storeId: string,
  card: ScrapedCard,
  printingId: string,
  recordedAt: string,
): typeof schema.priceHistory.$inferInsert {
  return {
    printingId,
    storeId,
    priceAud: card.price,
    priceType: card.priceType,
    recordedAt,
  };
}

function buildUnmatchedRow(
  storeId: string,
  card: ScrapedCard,
): typeof schema.unmatchedCards.$inferInsert {
  return {
    storeId,
    rawName: card.rawName,
    rawSetName: card.setName,
    rawPrice: card.price,
    sourceUrl: card.sourceUrl,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[run-all] Building card matcher index...");
  const matcher = new CardMatcher();
  await matcher.build();

  const enabledStores = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.scraperEnabled, true));

  if (enabledStores.length === 0) {
    console.log("[run-all] No stores with scraperEnabled = true. Done.");
    return;
  }

  console.log(`[run-all] Found ${enabledStores.length} enabled store(s): ${enabledStores.map((s) => s.id).join(", ")}`);

  for (const store of enabledStores) {
    const factory = SCRAPERS[store.id];
    if (!factory) {
      console.warn(`[run-all] No scraper registered for store "${store.id}" — skipping`);
      continue;
    }

    const scraper = factory();
    try {
      await runStore(store.id, scraper, matcher);
    } catch (err) {
      console.error(`[run-all] Fatal error scraping ${store.id}:`, err);
    } finally {
      await scraper.close();
    }
  }

  console.log("\n[run-all] All stores done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
