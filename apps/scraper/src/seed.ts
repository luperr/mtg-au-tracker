/**
 * Seed the stores table with Australian MTG retailers.
 * Run once after initial DB setup: pnpm --filter @mtg-au/scraper seed
 */

import { db, schema } from "./lib/db.js";
import { sql } from "drizzle-orm";

const AU_STORES = [
  {
    id: "mtgmate",
    name: "MTG Mate",
    url: "https://www.mtgmate.com.au",
    scraperEnabled: true,
    supportsBuylist: true,
  },
  {
    id: "goodgames",
    name: "Good Games",
    url: "https://tcg.goodgames.com.au",
    scraperEnabled: false, // Enable when scraper is built
    supportsBuylist: true,
  },
  {
    id: "manamarket",
    name: "Mana Market",
    url: "https://manamarket.com.au",
    scraperEnabled: false,
    supportsBuylist: true,
  },
  {
    id: "mtgsinglesau",
    name: "MTG Singles Australia",
    url: "https://www.mtgsinglesaustralia.com",
    scraperEnabled: false,
    supportsBuylist: true,
  },
];

async function seed() {
  console.log("Seeding stores...");

  await db
    .insert(schema.stores)
    .values(AU_STORES)
    .onConflictDoUpdate({
      target: schema.stores.id,
      set: {
        name: sql`excluded.name`,
        url: sql`excluded.url`,
        supportsBuylist: sql`excluded.supports_buylist`,
      },
    });

  console.log(`Seeded ${AU_STORES.length} stores.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
