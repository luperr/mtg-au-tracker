/**
 * Run all enabled store scrapers.
 * This is the entry point for: pnpm scrape:stores
 *
 * TODO (Milestone 2): Implement MTG Mate scraper and wire it up here.
 */

import { db, schema } from "../lib/db.js";
import { eq } from "drizzle-orm";
import { buildPrintingIndex, matchCard } from "../matching/card-matcher.js";
import type { ScrapedCard, MatchResult } from "@mtg-au/shared";

export async function runAllScrapers(): Promise<void> {
  console.log("Starting store scrape run...");

  // Get enabled stores
  const enabledStores = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.scraperEnabled, true));

  if (enabledStores.length === 0) {
    console.log("No stores enabled for scraping. Add stores to the database first.");
    return;
  }

  console.log(`${enabledStores.length} store(s) enabled for scraping`);

  // Build the matching index once for all scrapers
  const index = await buildPrintingIndex();

  // TODO: For each store, instantiate the appropriate scraper,
  // run it, match results, and upsert into store_prices.
  // This will be implemented in Milestone 2.

  for (const store of enabledStores) {
    console.log(`\nScraping ${store.name}... (not yet implemented)`);
  }

  console.log("\nStore scrape run complete.");
}

// Allow running directly
const isDirectRun =
  process.argv[1]?.endsWith("run-all.ts") ||
  process.argv[1]?.endsWith("run-all.js");

if (isDirectRun) {
  runAllScrapers()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Store scrape failed:", err);
      process.exit(1);
    });
}
