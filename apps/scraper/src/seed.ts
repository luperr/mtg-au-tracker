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
import { logger } from "./lib/logger.js";

const log = logger.child({ component: "seed" });

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
    id: "games_portal",
    name: "Games Portal",
    baseUrl: "https://gamesportal.com.au",
    scraperEnabled: true,
  },
  {
    id: "guf",
    name: "GUF",
    baseUrl: "https://guf.com.au",
    scraperEnabled: true,
  },
  {
    id: "inn_games",
    name: "Inn Games",
    baseUrl: "https://inngames.com.au",
    scraperEnabled: true,
  },
  {
    id: "irresistible_force",
    name: "Irresistible Force",
    baseUrl: "https://tcg.irresistibleforce.com.au",
    scraperEnabled: true,
  },
  {
    id: "legends_and_collectables",
    name: "Legends & Collectables",
    baseUrl: "https://legendsandcollectables.com",
    scraperEnabled: true,
  },
  {
    id: "lots_moore",
    name: "Lots Moore",
    baseUrl: "https://online.lotsmoore.com.au",
    scraperEnabled: true,
  },
  {
    id: "mana_market",
    name: "Mana Market",
    baseUrl: "https://manamarket.com.au",
    scraperEnabled: true,
  },
  {
    id: "pro_gamers",
    name: "Pro Gamers",
    baseUrl: "https://progamers.com.au",
    scraperEnabled: true,
  },
  {
    id: "rhystic_nostalgia",
    name: "Rhystic Nostalgia Gaming",
    baseUrl: "https://rhysticnostalgiagaming.com.au",
    scraperEnabled: true,
  },
  {
    id: "tabernacle_games",
    name: "Tabernacle Games",
    baseUrl: "https://tcg.tabernaclegames.com.au",
    scraperEnabled: true,
  },
  {
    id: "cardhouse",
    name: "Cardhouse",
    baseUrl: "https://www.cardhouse.com.au",
    scraperEnabled: true,
  },
  {
    id: "tcg_singles",
    name: "TCG Singles",
    baseUrl: "https://tcgsingles.com.au",
    scraperEnabled: true,
  },
  {
    id: "chromatic_games",
    name: "Chromatic Games",
    baseUrl: "https://chromaticgamestcg.com.au",
    scraperEnabled: true,
  },
  {
    id: "general_games",
    name: "General Games",
    baseUrl: "https://www.generalgames.com.au",
    scraperEnabled: true,
  },
  {
    id: "elemental_arcade",
    name: "Elemental Arcade",
    baseUrl: "https://elementalarcade.com.au",
    scraperEnabled: true,
  },
  {
    id: "ronin_games",
    name: "Ronin Games",
    baseUrl: "https://roningames.com.au",
    scraperEnabled: true,
  },
  {
    id: "from_the_deep",
    name: "From the Deep Games",
    baseUrl: "https://fromthedeepgames.com.au",
    scraperEnabled: true,
  },
  {
    id: "crit_hit",
    name: "Crit Hit",
    baseUrl: "https://www.crithit.com.au",
    scraperEnabled: true,
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
  log.info("Seeding stores");

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

  log.info({ count: STORES.length }, "Stores upserted");
}

async function main() {
  await seedStores();
  process.exit(0);
}

// Only run when invoked directly (pnpm --filter @mtg-au/scraper seed),
// not when seedStores() is imported by run-all.ts or index.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    log.fatal({ err }, "Seed failed");
    process.exit(1);
  });
}
