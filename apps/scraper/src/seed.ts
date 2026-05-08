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
  { id: "mtg_mate", name: "MTG Mate", baseUrl: "https://www.mtgmate.com.au", scraperEnabled: true, logoUrl: null },
  { id: "good_games", name: "Good Games", baseUrl: "https://tcg.goodgames.com.au", scraperEnabled: true, logoUrl: null },
  { id: "gameology", name: "Gameology", baseUrl: "https://www.gameology.com.au", scraperEnabled: true, logoUrl: null },
  { id: "plenty_of_games", name: "Plenty of Games", baseUrl: "https://plentyofgames.com.au", scraperEnabled: true, logoUrl: null },
  { id: "games_portal", name: "Games Portal", baseUrl: "https://gamesportal.com.au", scraperEnabled: true, logoUrl: null },
  { id: "guf", name: "GUF", baseUrl: "https://guf.com.au", scraperEnabled: true, logoUrl: null },
  { id: "inn_games", name: "Inn Games", baseUrl: "https://inngames.com.au", scraperEnabled: true, logoUrl: null },
  {
    id: "irresistible_force",
    name: "Irresistible Force",
    baseUrl: "https://tcg.irresistibleforce.com.au",
    scraperEnabled: true,
    logoUrl: "https://tcg.irresistibleforce.com.au/cdn/shop/files/IF_TCG-01_50757609-f096-420c-869a-3521e3059de4.png?v=1755745472&width=180",
  },
  {
    id: "legends_and_collectables",
    name: "Legends & Collectables",
    baseUrl: "https://legendsandcollectables.com",
    scraperEnabled: true,
    logoUrl: "https://www.legendsandcollectables.com/cdn/shop/files/Legends_and_collectables_logo_large.png?v=1651373462",
  },
  { id: "lots_moore", name: "Lots Moore", baseUrl: "https://online.lotsmoore.com.au", scraperEnabled: true, logoUrl: null },
  { id: "mana_market", name: "Mana Market", baseUrl: "https://manamarket.com.au", scraperEnabled: true, logoUrl: null },
  { id: "pro_gamers", name: "Pro Gamers", baseUrl: "https://progamers.com.au", scraperEnabled: true, logoUrl: null },
  { id: "rhystic_nostalgia", name: "Rhystic Nostalgia Gaming", baseUrl: "https://rhysticnostalgiagaming.com.au", scraperEnabled: true, logoUrl: null },
  { id: "tabernacle_games", name: "Tabernacle Games", baseUrl: "https://tcg.tabernaclegames.com.au", scraperEnabled: true, logoUrl: null },
  { id: "cardhouse", name: "Cardhouse", baseUrl: "https://www.cardhouse.com.au", scraperEnabled: true, logoUrl: null },
  { id: "tcg_singles", name: "TCG Singles", baseUrl: "https://tcgsingles.com.au", scraperEnabled: true, logoUrl: null },
  { id: "chromatic_games", name: "Chromatic Games", baseUrl: "https://chromaticgamestcg.com.au", scraperEnabled: true, logoUrl: null },
  { id: "general_games", name: "General Games", baseUrl: "https://www.generalgames.com.au", scraperEnabled: true, logoUrl: null },
  { id: "elemental_arcade", name: "Elemental Arcade", baseUrl: "https://elementalarcade.com.au", scraperEnabled: true, logoUrl: null },
  { id: "ronin_games", name: "Ronin Games", baseUrl: "https://roningames.com.au", scraperEnabled: true, logoUrl: null },
  {
    id: "from_the_deep",
    name: "From the Deep Games",
    baseUrl: "https://fromthedeepgames.com.au",
    scraperEnabled: true,
    logoUrl: "https://fromthedeepgames.com.au/cdn/shop/files/FROMTHE_DEEP_logo-01_-_Chris_Senior_2_large.png?v=1639066356",
  },
  { id: "crit_hit", name: "Crit Hit", baseUrl: "https://www.crithit.com.au", scraperEnabled: true, logoUrl: null },
  { id: "mega_games", name: "Mega Games", baseUrl: "https://www.megagames.com.au", scraperEnabled: true, logoUrl: null },
  { id: "ozzie_collectables", name: "Ozzie Collectables", baseUrl: "https://www.ozziecollectables.com", scraperEnabled: true, logoUrl: null },
  { id: "playmantis", name: "Playmantis", baseUrl: "https://playmantis.com.au", scraperEnabled: true, logoUrl: null },
  {
    id: "raptor_games",
    name: "Raptor Games",
    baseUrl: "https://raptorgames.com",
    scraperEnabled: true,
    logoUrl: "https://raptorgames.com/cdn/shop/files/TEAMRAPTOR.png?v=1738217064&width=600",
  },
  {
    id: "kastle_cards_and_games",
    name: "Kastle Cards & Games",
    baseUrl: "https://kastlecardsandgames.com",
    scraperEnabled: true,
    logoUrl: "https://kastlecardsandgames.com/cdn/shop/files/600259512_122106647535159492_7530305649160251594_n.jpg?height=200&v=1767776369",
  },
  { id: "shuffled", name: "Shuffled", baseUrl: "https://shuffled.com.au", scraperEnabled: true, logoUrl: null },
  { id: "the_card_hub_australia", name: "The Card Hub Australia", baseUrl: "https://thecardhubaustralia.com.au", scraperEnabled: true, logoUrl: null },
  { id: "that_game_store", name: "That Game Store", baseUrl: "https://thatgamestore.com.au", scraperEnabled: true, logoUrl: null },
  { id: "area52", name: "Area52", baseUrl: "https://area52.com.au", scraperEnabled: true, logoUrl: null },
  { id: "mtg_singles_aus", name: "MTG Singles Australia", baseUrl: "https://www.mtgsinglesaustralia.com.au", scraperEnabled: false, logoUrl: null },
  { id: "ebay_au", name: "eBay AU", baseUrl: "https://www.ebay.com.au", scraperEnabled: true, logoUrl: null },
  { id: "shuffled_and_cut_games", name: "Shuffled and Cut Games", baseUrl: "https://shuffledandcutgames.com", scraperEnabled: true, logoUrl: null },
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
        logoUrl: sql`excluded.logo_url`,
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
