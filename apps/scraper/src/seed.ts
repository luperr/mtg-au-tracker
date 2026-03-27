/**
 * Seed the stores table with known Australian MTG retailers.
 *
 * Safe to re-run — upserts by id, updating name/baseUrl/scraperEnabled if the
 * row already exists. This means re-running seed will pick up any changes here.
 *
 * Run with: docker compose run --rm dev pnpm --filter @mtg-au/scraper seed
 */

import { fileURLToPath } from "url";
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
    id: "gameology",
    name: "Gameology",
    baseUrl: "https://www.gameology.com.au",
    scraperEnabled: true,
  },
  {
    id: "plenty_of_games",
    name: "Plenty of Games",
    baseUrl: "https://plentyofgames.com.au",
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

export async function seedStores(): Promise<void> {
  console.log("[Seed] Seeding stores...");

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

  console.log(`[Seed] Upserted ${STORES.length} stores.`);
}

async function main() {
  await seedStores();
  process.exit(0);
}

// Only run when invoked directly (pnpm --filter @mtg-au/scraper seed),
// not when seedStores() is imported by run-all.ts or index.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
