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
import { CRON_TIMEZONE, CRON_SCRYFALL, CRON_STORES, CRON_EBAY } from "./lib/config.js";
import { runScryfallImport } from "./scryfall/bulk-import.js";
import { runAllStores } from "./stores/run-all.js";
import { runEbayImport } from "./ebay/ebay-import.js";
import { logger } from "./lib/logger.js";

const log = logger.child({ component: "scheduler" });

async function main(): Promise<void> {
  log.info("Scrymarket scraper service starting");

  // Bootstrap: run Scryfall import if DB is empty
  const [{ value: cardCount }] = await db
    .select({ value: count() })
    .from(schema.cards);

  if (Number(cardCount) === 0) {
    log.info("Database is empty — running initial Scryfall import");
    await runScryfallImport();
  } else {
    log.info({ card_count: Number(cardCount) }, "Database has cards — skipping bootstrap");
  }

  const cronOptions = { timezone: CRON_TIMEZONE };

  cron.schedule(CRON_SCRYFALL, async () => {
    log.info("Scryfall cron — running Scryfall import");
    try {
      await runScryfallImport();
    } catch (err) {
      log.error({ err }, "Scryfall import failed");
    }
  }, cronOptions);

  cron.schedule(CRON_STORES, async () => {
    log.info("Stores cron — running store scrapers");
    try {
      await runAllStores();
    } catch (err) {
      log.error({ err }, "Store scrape failed");
    }
  }, cronOptions);

  cron.schedule(CRON_EBAY, async () => {
    log.info("eBay cron — running eBay AU import");
    try {
      await runEbayImport();
    } catch (err) {
      log.error({ err }, "eBay import failed");
    }
  }, cronOptions);

  log.info(
    { scryfall: CRON_SCRYFALL, stores: CRON_STORES, ebay: CRON_EBAY, tz: CRON_TIMEZONE },
    "Cron jobs scheduled. Service running.",
  );
}

main().catch((err) => {
  log.fatal({ err }, "Fatal startup error");
  process.exit(1);
});
