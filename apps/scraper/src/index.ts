/**
 * Scraper service entry point — runs as a long-lived process.
 *
 * Schedules:
 *   3 AM daily → Scryfall bulk import (refreshes card/printing data + USD prices)
 *   5 AM daily → Store scrapers (MTG Mate, Good Games) → writes to store_prices + price_history
 *
 * On startup: if the cards table is empty, runs the Scryfall import immediately
 * so the service is usable without a manual bootstrap step.
 */

import cron from "node-cron";
import { count } from "drizzle-orm";
import { db, schema } from "./lib/db.js";
import { runScryfallImport } from "./scryfall/bulk-import.js";
import { runAllStores } from "./stores/run-all.js";
import { runEbayImport } from "./ebay/ebay-import.js";

async function main(): Promise<void> {
  console.log("[Scheduler] Scrymarket scraper service starting...");

  // Bootstrap: run Scryfall import if DB is empty
  const [{ value: cardCount }] = await db
    .select({ value: count() })
    .from(schema.cards);

  if (Number(cardCount) === 0) {
    console.log("[Scheduler] Database is empty — running initial Scryfall import...");
    await runScryfallImport();
  } else {
    console.log(`[Scheduler] Database has ${Number(cardCount).toLocaleString()} cards — skipping bootstrap.`);
  }

  const cronOptions = { timezone: "Australia/Sydney" };

  // 3 AM daily AEDT/AEST — refresh Scryfall card data + USD prices
  cron.schedule("0 3 * * *", async () => {
    console.log("[Scheduler] 3 AM — Running Scryfall import...");
    try {
      await runScryfallImport();
    } catch (err) {
      console.error("[Scheduler] Scryfall import failed:", err);
    }
  }, cronOptions);

  // 5 AM daily AEDT/AEST — scrape store prices
  cron.schedule("0 5 * * *", async () => {
    console.log("[Scheduler] 5 AM — Running store scrapers...");
    try {
      await runAllStores();
    } catch (err) {
      console.error("[Scheduler] Store scrape failed:", err);
    }
  }, cronOptions);

  // 6 AM daily AEDT/AEST — import eBay AU market prices
  cron.schedule("0 6 * * *", async () => {
    console.log("[Scheduler] 6 AM — Running eBay AU import...");
    try {
      await runEbayImport();
    } catch (err) {
      console.error("[Scheduler] eBay import failed:", err);
    }
  }, cronOptions);

  console.log("[Scheduler] Cron jobs scheduled (Scryfall @ 3 AM, stores @ 5 AM, eBay @ 6 AM). Service running.");
}

main().catch((err) => {
  console.error("[Scheduler] Fatal startup error:", err);
  process.exit(1);
});
