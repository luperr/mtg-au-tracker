/**
 * Run a single store scraper by ID.
 * Usage: tsx src/stores/run-store.ts <store_id>
 * Example: pnpm --filter @mtg-au/scraper scrape:goodgames
 */

import { fileURLToPath } from "url";
import { CardMatcher } from "../matching/card-matcher.js";
import { SCRAPERS, runStore } from "./run-all.js";
import { STORE_REGISTRY } from "./stores.config.js";
import { seedStores } from "../seed.js";
import { refreshCardPrices } from "../market/refresh-card-aggregates.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "run-store" });

async function main() {
  const storeId = process.argv[2];
  if (!storeId) {
    log.error({ available: Object.keys(SCRAPERS) }, "Usage: tsx src/stores/run-store.ts <store_id>");
    process.exit(1);
  }

  const factory = SCRAPERS[storeId];
  if (!factory) {
    // A disabled store is registered but deliberately absent from SCRAPERS, so say
    // that rather than "no scraper" — the distinction is the whole point of the gate.
    if (STORE_REGISTRY.some((s) => s.id === storeId)) {
      log.error({ store: storeId }, "Store has scraperEnabled = false — refusing to scrape it");
    } else {
      log.error({ store: storeId, available: Object.keys(SCRAPERS) }, "No scraper registered for store");
    }
    process.exit(1);
  }

  // Same first step as runAllStores(). Without it, scraping a store that was
  // added to STORE_REGISTRY but never seeded fails on a store_prices FK
  // violation partway through the run.
  await seedStores();

  log.info("Building card matcher index");
  const matcher = new CardMatcher();
  await matcher.build();

  const scraper = factory();
  try {
    await runStore(storeId, scraper, matcher);
  } finally {
    await scraper.close();
  }

  // Full recompute over store_prices, not a per-store one, so scraping a single store
  // leaves the same aggregates a full run would. Cheap enough (seconds) that skipping
  // it only buys a confusing dev environment where search shows yesterday's prices.
  await refreshCardPrices();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    // The postgres client keeps the event loop alive, so without an explicit
    // exit a finished run just hangs — indistinguishable from a stalled scrape.
    // Same reason seed.ts exits explicitly.
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, "Run-store failed");
      process.exit(1);
    });
}
