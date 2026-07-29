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

import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { BATCH_SIZE } from "../lib/config.js";
import { todayISO, matchRate } from "../lib/utils.js";
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

  // Clear stale data from previous runs
  await db.delete(schema.storePrices).where(eq(schema.storePrices.storeId, storeId));
  await db.delete(schema.unmatchedCards).where(eq(schema.unmatchedCards.storeId, storeId));
  log.debug({ store: storeId }, "Cleared existing prices and unmatched cards");

  type PriceRow = typeof schema.storePrices.$inferInsert;
  type HistoryRow = typeof schema.priceHistory.$inferInsert;
  type UnmatchedRow = typeof schema.unmatchedCards.$inferInsert;

  const priceBatch: PriceRow[] = [];
  const historyBatch: HistoryRow[] = [];
  const unmatchedBatch: UnmatchedRow[] = [];

  let matched = 0;
  let unmatched = 0;
  let total = 0;
  let totalConfidence = 0;
  const byMatchType: Record<string, number> = {};

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
  }

  // Final flush
  await flushPrices();
  await flushHistory();

  if (unmatchedBatch.length > 0) {
    await db.insert(schema.unmatchedCards).values(unmatchedBatch);
  }

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

  log.info({ stores: enabledStores.map((s) => s.id) }, "Starting store scrapes");

  const health: StoreHealth[] = [];

  for (const store of enabledStores) {
    const factory = SCRAPERS[store.id];
    if (!factory) {
      log.warn({ store: store.id }, "No scraper registered for store — skipping");
      health.push({ storeId: store.id, total: 0, matched: 0, issue: "error" });
      continue;
    }

    const scraper = factory();
    try {
      health.push(await runStore(store.id, scraper, matcher));
    } catch (err) {
      log.error({ err, store: store.id }, "Fatal error scraping store");
      health.push({ storeId: store.id, total: 0, matched: 0, issue: "error" });
    } finally {
      await scraper.close();
    }
  }

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
