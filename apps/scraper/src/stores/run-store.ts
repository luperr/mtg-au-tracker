/**
 * Run a single store scraper by ID.
 * Usage: tsx src/stores/run-store.ts <store_id>
 * Example: pnpm --filter @mtg-au/scraper scrape:goodgames
 */

import { fileURLToPath } from "url";
import { CardMatcher } from "../matching/card-matcher.js";
import { SCRAPERS, runStore } from "./run-all.js";

async function main() {
  const storeId = process.argv[2];
  if (!storeId) {
    console.error("Usage: tsx src/stores/run-store.ts <store_id>");
    console.error("Available:", Object.keys(SCRAPERS).join(", "));
    process.exit(1);
  }

  const factory = SCRAPERS[storeId];
  if (!factory) {
    console.error(`No scraper registered for "${storeId}". Available: ${Object.keys(SCRAPERS).join(", ")}`);
    process.exit(1);
  }

  console.log(`[run-store] Building card matcher index...`);
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
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
