/**
 * Shopify store configurations.
 *
 * ## Adding a new Shopify store — checklist
 *
 * 1. Add an entry to SHOPIFY_STORES below (id, baseUrl, collectionHandle).
 * 2. Add the store to STORES in apps/scraper/src/seed.ts (scraperEnabled: true).
 * 3. Add flat-rate postage to STORE_FLAT_SHIPPING_AUD in
 *    apps/web/src/lib/store-shipping.ts (use null if postage varies).
 * 4. Add to package.json for manual testing (e.g. "scrape:newstore": "tsx src/stores/run-store.ts new_store").
 * 4. Run seed:  docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed
 * 5. Test run: docker compose run --rm scraper pnpm --filter @mtg-au/scraper scrape:stores
 *
 * No scraper code changes are needed for Shopify stores.
 */

export interface ShopifyStoreConfig {
  id: string;               // matches stores.id in DB (e.g. "good_games")
  baseUrl: string;          // e.g. "https://tcg.goodgames.com.au"
  collectionHandle: string; // Shopify collection slug (e.g. "mtg-singles-all-products")
  // "all-in-title": store bakes card name + collector# + set + foil + condition
  // all into the product title with a single "Default Title" variant.
  // e.g. "Zenos yae Galvus (Borderless) 384 Rare FINAL FANTASY Foil NM/M"
  titleFormat?: "all-in-title";
  // true: variants represent physical store locations (e.g. "Bendigo", "Geelong"),
  // not condition/foil. Collapse per-foil-type; condition implied NM; foil from SKU;
  // inStock = true if any location variant is available. (GUF-style stores.)
  locationVariants?: true;
}

export const SHOPIFY_STORES: ShopifyStoreConfig[] = [
  {
    id: "good_games",
    baseUrl: "https://tcg.goodgames.com.au",
    collectionHandle: "mtg-singles-all-products",
  },
  {
    id: "gameology",
    baseUrl: "https://www.gameology.com.au",
    collectionHandle: "magic-the-gathering-singles",
  },
  {
    id: "plenty_of_games",
    baseUrl: "https://plentyofgames.com.au",
    collectionHandle: "mtg-singles-all-products",
  },
  {
    id: "games_portal",
    baseUrl: "https://gamesportal.com.au",
    collectionHandle: "magic-singles-instock",
  },
  {
    id: "guf",
    baseUrl: "https://guf.com.au",
    collectionHandle: "mtg-singles-instock-all-stores",
    locationVariants: true,
  },
  {
    id: "inn_games",
    baseUrl: "https://inngames.com.au",
    collectionHandle: "mtg-singles-instock",
  },
  {
    id: "irresistible_force",
    baseUrl: "https://tcg.irresistibleforce.com.au",
    collectionHandle: "magic-the-gathering-singles",
  },
  {
    id: "legends_and_collectables",
    baseUrl: "https://legendsandcollectables.com",
    collectionHandle: "mtg-singles-all-products",
  },
  {
    id: "lots_moore",
    baseUrl: "https://online.lotsmoore.com.au",
    collectionHandle: "mtg-singles-instock",
  },
  {
    id: "mana_market",
    baseUrl: "https://manamarket.com.au",
    collectionHandle: "magic-the-gathering-singles",
  },
  {
    id: "pro_gamers",
    baseUrl: "https://progamers.com.au",
    collectionHandle: "mtg-singles-instock",
  },
  {
    id: "rhystic_nostalgia",
    baseUrl: "https://rhysticnostalgiagaming.com.au",
    collectionHandle: "mtg-singles-instock",
  },
  {
    id: "tabernacle_games",
    baseUrl: "https://tcg.tabernaclegames.com.au",
    collectionHandle: "mtg-singles-instock",
  },
  {
    id: "cardhouse",
    baseUrl: "https://www.cardhouse.com.au",
    collectionHandle: "mtg-singles",
  },
  {
    id: "tcg_singles",
    baseUrl: "https://tcgsingles.com.au",
    collectionHandle: "mtg-singles-instock",
  },
  {
    id: "chromatic_games",
    baseUrl: "https://chromaticgamestcg.com.au",
    collectionHandle: "mtg-singles-in-stock",
  },
  {
    id: "general_games",
    baseUrl: "https://www.generalgames.com.au",
    collectionHandle: "mtg-singles",
  },
  {
    id: "elemental_arcade",
    baseUrl: "https://elementalarcade.com.au",
    collectionHandle: "magic-the-gathering-tcg-singles",
  },
  {
    id: "ronin_games",
    baseUrl: "https://roningames.com.au",
    collectionHandle: "mtg-singles-instock",
  },
  {
    id: "from_the_deep",
    baseUrl: "https://fromthedeepgames.com.au",
    collectionHandle: "mtg-singles-instock",
  },
  {
    id: "crit_hit",
    baseUrl: "https://www.crithit.com.au",
    collectionHandle: "magic-the-gathering-singles",
  },
  {
    id: "hr_games",
    baseUrl: "https://hrgames.au",
    collectionHandle: "magic-the-gathering-singles",
  },
  {
    id: "mega_games",
    baseUrl: "https://www.megagames.com.au",
    collectionHandle: "mtg-singles",
  },
  {
    id: "ozzie_collectables",
    baseUrl: "https://www.ozziecollectables.com",
    collectionHandle: "mtg-singles",
  },
  {
    id: "playmantis",
    baseUrl: "https://playmantis.com.au",
    collectionHandle: "magic-the-gathering-singles",
  },
  {
    id: "raptor_games",
    baseUrl: "https://raptorgames.com",
    collectionHandle: "magic-the-gathering-singles",
    titleFormat: "all-in-title",
  },
  {
    id: "kastle_cards_and_games",
    baseUrl: "https://kastlecardsandgames.com",
    collectionHandle: "magic-the-gathering",
  },
  {
    id: "shuffled",
    baseUrl: "https://shuffled.com.au",
    collectionHandle: "mtg-singles-instock",
  },
  {
    id: "the_card_hub_australia",
    baseUrl: "https://thecardhubaustralia.com.au",
    collectionHandle: "mtg-singles",
  },
  {
    id: "that_game_store",
    baseUrl: "https://thatgamestore.com.au",
    collectionHandle: "mtg-singles-australia-instock",
  },
  {   
    id: "area52",
    baseUrl: "https://singles.area52.com.au",
    collectionHandle: "mtg-singles-instock",
  },
    {   
    id: "shuffle_and_cut_games",
    baseUrl: "https://shuffleandcutgames.com",
    collectionHandle: "mtg-singles",
  },
];
