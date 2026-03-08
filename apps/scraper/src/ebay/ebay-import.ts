/**
 * eBay import orchestrator.
 *
 * Full pipeline:
 *   1. Build CardMatcher index from DB (all printings in memory)
 *   2. Delete all existing store_prices and unmatched_cards for ebay_au
 *   3. Search eBay AU via Browse API (async generator, page by page)
 *   4. Transform each listing title into a ScrapedCard
 *   5. Match each ScrapedCard to a Scryfall printing via CardMatcher
 *   6. Bulk-insert matched prices into store_prices
 *   7. Upsert today's snapshot into price_history (ON CONFLICT DO NOTHING)
 *   8. Bulk-insert unmatched listings into unmatched_cards
 *
 * Run manually:
 *   tsx src/ebay/ebay-import.ts
 *
 * Called by the scheduler in index.ts at 6 AM daily.
 */

import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { CardMatcher } from "../matching/card-matcher.js";
import { searchEbayAU } from "./browse-client.js";
import { transformEbayItem } from "./transform.js";

const STORE_ID = "ebay_au";

// Batch size for DB inserts — keeps memory bounded
const BATCH_SIZE = 500;

export async function runEbayImport(): Promise<void> {
  console.log("[eBay Import] Starting eBay AU price import...");

  // ── Step 1: Build card matcher index ──────────────────────────────────────
  console.log("[eBay Import] Building card matcher index...");
  const matcher = new CardMatcher();
  await matcher.build();

  // ── Step 2: Clear stale data ───────────────────────────────────────────────
  // Per design decision in CLAUDE.md: delete-then-insert, no upsert complexity.
  console.log("[eBay Import] Clearing existing eBay prices...");
  await db.delete(schema.storePrices).where(eq(schema.storePrices.storeId, STORE_ID));
  await db.delete(schema.unmatchedCards).where(eq(schema.unmatchedCards.storeId, STORE_ID));

  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  type PriceRow = typeof schema.storePrices.$inferInsert;
  type HistoryRow = typeof schema.priceHistory.$inferInsert;
  type UnmatchedRow = typeof schema.unmatchedCards.$inferInsert;

  const priceBatch: PriceRow[] = [];
  const historyBatch: HistoryRow[] = [];
  const unmatchedBatch: UnmatchedRow[] = [];

  let totalFetched = 0;
  let totalSkipped = 0;
  let matched = 0;
  let unmatched = 0;

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

  async function flushUnmatched(): Promise<void> {
    if (unmatchedBatch.length === 0) return;
    await db.insert(schema.unmatchedCards).values(unmatchedBatch);
    unmatchedBatch.length = 0;
  }

  // ── Step 3-7: Stream, transform, match, insert ────────────────────────────
  for await (const item of searchEbayAU()) {
    totalFetched++;

    // Transform raw eBay listing → ScrapedCard (returns null for non-singles)
    const card = transformEbayItem(item);
    if (!card) {
      totalSkipped++;
      continue;
    }

    // Match scraped card → Scryfall printing
    const result = matcher.match(card);

    if (result.printingId) {
      priceBatch.push({
        printingId: result.printingId,
        storeId: STORE_ID,
        priceAud: card.price,
        priceType: card.priceType,
        condition: card.condition,
        inStock: card.inStock,
        url: card.sourceUrl,
      });
      historyBatch.push({
        printingId: result.printingId,
        storeId: STORE_ID,
        priceAud: card.price,
        priceType: card.priceType,
        recordedAt: today,
      });
      matched++;
    } else {
      unmatchedBatch.push({
        storeId: STORE_ID,
        rawName: card.rawName,
        rawSetName: card.setName,
        rawPrice: card.price,
        sourceUrl: card.sourceUrl,
      });
      unmatched++;
    }

    // Flush to DB in batches to keep memory bounded
    if (priceBatch.length >= BATCH_SIZE) {
      await flushPrices();
      await flushHistory();
    }
    if (unmatchedBatch.length >= BATCH_SIZE) {
      await flushUnmatched();
    }

    // Progress log every 1000 items
    if (totalFetched % 1000 === 0) {
      console.log(
        `[eBay Import] Progress: ${totalFetched} fetched, ${totalSkipped} skipped, ${matched} matched, ${unmatched} unmatched`,
      );
    }
  }

  // Final flush
  await flushPrices();
  await flushHistory();
  await flushUnmatched();

  // ── Summary ───────────────────────────────────────────────────────────────
  const matchPct = matched + unmatched > 0
    ? (((matched) / (matched + unmatched)) * 100).toFixed(1)
    : "0";

  console.log(`\n[eBay Import] Done.`);
  console.log(`  Fetched:   ${totalFetched}`);
  console.log(`  Skipped:   ${totalSkipped} (non-singles, auctions, bulk lots)`);
  console.log(`  Matched:   ${matched} (${matchPct}%)`);
  console.log(`  Unmatched: ${unmatched}`);
}

// ── Run directly to test ───────────────────────────────────────────────────────
// tsx src/ebay/ebay-import.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { config } = await import("dotenv");
  config({ path: new URL("../../../../.env", import.meta.url).pathname });

  runEbayImport()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[eBay Import] Fatal error:", err);
      process.exit(1);
    });
}
