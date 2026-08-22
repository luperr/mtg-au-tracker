/**
 * Store scraper orchestrator.
 *
 * For each store with scraperEnabled = true:
 *   1. Build the in-memory card matching index (once, shared across all stores)
 *   2. Open a transaction, and inside it:
 *      a. Delete existing store_prices and unmatched_cards for this store
 *      b. Run the store's scraper (async generator)
 *      c. Match each ScrapedCard to a Scryfall printing
 *      d. Bulk-insert matched prices into store_prices
 *      e. Upsert today's snapshot into price_history (insert, on conflict do nothing)
 *      f. Log unmatched cards to unmatched_cards for review
 *
 * Step 2 is one transaction so a store either replaces its data completely or
 * keeps yesterday's — see runStore() for what went wrong when it wasn't.
 *
 * Run manually:
 *   docker compose run --rm dev pnpm --filter @mtg-au/scraper scrape:stores
 */

import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { BATCH_SIZE, STORE_CONCURRENCY } from "../lib/config.js";
import { todayISO, matchRate, mapWithConcurrency } from "../lib/utils.js";
import { CardMatcher } from "../matching/card-matcher.js";
import { MtgMateScraper } from "./mtgmate.js";
import { ShopifyScraper } from "./shopify.js";
import { CrystalCommerceScraper } from "./crystalcommerce.js";
import { shopifyStores, crystalCommerceStores } from "./stores.config.js";
import { seedStores } from "../seed.js";
import type { BaseScraper } from "./base-scraper.js";
import type { ScrapedCard } from "@mtg-au/shared";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "run-all" });

// ── Scraper registry ──────────────────────────────────────────────────────────
// To add a Shopify or CrystalCommerce store, add an entry to stores.config.ts.
// Scrapers for bespoke platforms are registered here manually.
export const SCRAPERS: Record<string, () => BaseScraper> = {
  mtg_mate: () => new MtgMateScraper(),
  ...Object.fromEntries(
    shopifyStores().map((config) => [config.id, () => new ShopifyScraper(config)])
  ),
  ...Object.fromEntries(
    crystalCommerceStores().map((config) => [config.id, () => new CrystalCommerceScraper(config)])
  ),
};

// ── Per-store run ─────────────────────────────────────────────────────────────

type StoreHealth = {
  storeId: string;
  total: number;
  matched: number;
  issue: "ok" | "zero_products" | "zero_matched" | "low_match_rate" | "error";
};

export async function runStore(
  storeId: string,
  scraper: BaseScraper,
  matcher: CardMatcher,
): Promise<StoreHealth> {
  const today = todayISO();

  log.info({ store: storeId }, "Starting store scrape");

  type PriceRow = typeof schema.storePrices.$inferInsert;
  type HistoryRow = typeof schema.priceHistory.$inferInsert;
  type UnmatchedRow = typeof schema.unmatchedCards.$inferInsert;

  let matched = 0;
  let unmatched = 0;
  let total = 0;
  let totalConfidence = 0;
  const byMatchType: Record<string, number> = {};

  /**
   * The delete and every insert run in one transaction, so a store either
   * replaces its prices completely or leaves yesterday's in place.
   *
   * Previously the delete was committed up front and rows were flushed
   * incrementally, which meant any mid-run failure published a partial
   * catalogue as if it were complete — a scraper that aborted at page 101 of
   * 446 still left 34,000 rows behind, and the web app served them.
   *
   * Rows are still flushed in BATCH_SIZE chunks rather than accumulated and
   * written at the end: buffering a whole store would hold ~100k rows per
   * scraper in Node's heap, and with STORE_CONCURRENCY stores in flight that is
   * enough to OOM the container. Postgres holds the uncommitted rows instead.
   */
  await db.transaction(async (tx) => {
    // Clear stale data from previous runs. Rolled back with everything else if
    // the scrape fails.
    await tx.delete(schema.storePrices).where(eq(schema.storePrices.storeId, storeId));
    await tx.delete(schema.unmatchedCards).where(eq(schema.unmatchedCards.storeId, storeId));
    log.debug({ store: storeId }, "Cleared existing prices and unmatched cards");

    const priceBatch: PriceRow[] = [];
    const historyBatch: HistoryRow[] = [];
    const unmatchedBatch: UnmatchedRow[] = [];

    async function flushPrices(): Promise<void> {
      if (priceBatch.length === 0) return;
      await tx.insert(schema.storePrices).values(priceBatch);
      priceBatch.length = 0;
    }

    async function flushHistory(): Promise<void> {
      if (historyBatch.length === 0) return;
      await tx.insert(schema.priceHistory).values(historyBatch).onConflictDoNothing();
      historyBatch.length = 0;
    }

    async function flushUnmatched(): Promise<void> {
      if (unmatchedBatch.length === 0) return;
      await tx.insert(schema.unmatchedCards).values(unmatchedBatch);
      unmatchedBatch.length = 0;
    }

    for await (const card of scraper.scrapeAll()) {
      total++;
      const result = matcher.match(card);

      byMatchType[result.matchType] = (byMatchType[result.matchType] ?? 0) + 1;

      if (result.printingId) {
        priceBatch.push(buildPriceRow(storeId, card, result.printingId));
        historyBatch.push(buildHistoryRow(storeId, card, result.printingId, today));
        totalConfidence += result.confidence;
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
      // Unmatched rows were previously held until the end of the run. A store
      // that matches nothing would then buffer its entire catalogue.
      if (unmatchedBatch.length >= BATCH_SIZE) {
        await flushUnmatched();
      }
    }

    // Final flush
    await flushPrices();
    await flushHistory();
    await flushUnmatched();
  });

  const rate = matchRate(matched, total);
  const issue: StoreHealth["issue"] =
    total === 0 ? "zero_products"
    : matched === 0 ? "zero_matched"
    : rate < 0.5 ? "low_match_rate"
    : "ok";

  if (issue !== "ok") {
    log.error({ store: storeId, total, matched, match_rate: rate, issue }, "Store health check failed");
  }

  log.info(
    {
      store: storeId, total, matched, unmatched, match_rate: rate,
      avg_confidence: matched > 0 ? +(totalConfidence / matched).toFixed(3) : 0,
      by_match_type: byMatchType,
    },
    "Store scrape complete",
  );

  return { storeId, total, matched, issue };
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

export async function runAllStores(): Promise<void> {
  await seedStores();
  log.info("Building card matcher index");
  const matcher = new CardMatcher();
  await matcher.build();

  const enabledStores = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.scraperEnabled, true));

  if (enabledStores.length === 0) {
    log.info("No stores with scraperEnabled = true — done");
    return;
  }

  log.info(
    { stores: enabledStores.map((s) => s.id), concurrency: STORE_CONCURRENCY },
    "Starting store scrapes",
  );

  // Stores run concurrently so one slow store doesn't serialise the rest — the
  // Games Cube alone takes ~1h against 33 stores that take minutes. Safe to
  // share: `matcher` is read-only once built, each store writes only its own
  // store_id rows, and BaseScraper's rate limiter is per-instance so every store
  // keeps its own pacing against its own host.
  //
  // Errors are caught per store, never rethrown, so one failure can't abort the
  // others via mapWithConcurrency's fail-fast.
  const health = await mapWithConcurrency(enabledStores, STORE_CONCURRENCY, async (store) => {
    const factory = SCRAPERS[store.id];
    if (!factory) {
      log.warn({ store: store.id }, "No scraper registered for store — skipping");
      return { storeId: store.id, total: 0, matched: 0, issue: "error" as const };
    }

    const scraper = factory();
    try {
      return await runStore(store.id, scraper, matcher);
    } catch (err) {
      log.error({ err, store: store.id }, "Fatal error scraping store");
      return { storeId: store.id, total: 0, matched: 0, issue: "error" as const };
    } finally {
      await scraper.close();
    }
  });

  const unhealthy = health.filter((h) => h.issue !== "ok");
  log.info(
    { total_stores: health.length, unhealthy_count: unhealthy.length, unhealthy: unhealthy.map((h) => ({ store: h.storeId, issue: h.issue })) },
    "All stores done",
  );
}

// Only run when invoked directly (pnpm scrape:stores), not when imported by index.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAllStores().catch((err) => {
    log.error({ err }, "Store scrape run failed");
    process.exit(1);
  });
}
