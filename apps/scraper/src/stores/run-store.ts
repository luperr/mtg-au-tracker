/**
 * Run a single store scraper by ID.
 * Usage: tsx src/stores/run-store.ts <store_id>
 * Example: pnpm --filter @mtg-au/scraper scrape:goodgames
 */

import { fileURLToPath } from "url";
import { CardMatcher } from "../matching/card-matcher.js";
import { SCRAPERS, runStore } from "./run-all.js";
import { seedStores } from "../seed.js";
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
    log.error({ store: storeId, available: Object.keys(SCRAPERS) }, "No scraper registered for store");
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
