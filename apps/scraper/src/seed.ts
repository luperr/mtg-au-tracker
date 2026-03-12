/**
 * Seed the stores table with known Australian MTG retailers.
 *
 * Safe to re-run — upserts by id, updating name/baseUrl/scraperEnabled if the
 * row already exists. This means re-running seed will pick up any changes here.
 *
 * Run with: docker compose run --rm dev pnpm --filter @mtg-au/scraper seed
 */

import { sql } from "drizzle-orm";
import { db, schema } from "./lib/db.js";

const STORES = [
  {
    id: "mtg_mate",
    name: "MTG Mate",
    baseUrl: "https://www.mtgmate.com.au",
    scraperEnabled: true,
  },
  {
    id: "good_games",
    name: "Good Games",
    baseUrl: "https://tcg.goodgames.com.au",
    scraperEnabled: true,
  },
  {
    id: "mana_market",
    name: "Mana Market",
    baseUrl: "https://manamarket.com.au",
    scraperEnabled: false,
  },
  {
    id: "mtg_singles_aus",
    name: "MTG Singles Australia",
    baseUrl: "https://www.mtgsinglesaustralia.com.au",
    scraperEnabled: false,
  },
  {
    id: "ebay_au",
    name: "eBay AU",
    baseUrl: "https://www.ebay.com.au",
    scraperEnabled: true,
  },
];

async function main() {
  console.log("Seeding stores...");

  await db
    .insert(schema.stores)
    .values(STORES)
    .onConflictDoUpdate({
      target: schema.stores.id,
      set: {
        name: sql`excluded.name`,
        baseUrl: sql`excluded.base_url`,
        scraperEnabled: sql`excluded.scraper_enabled`,
      },
    });

  console.log(`Upserted ${STORES.length} stores.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
