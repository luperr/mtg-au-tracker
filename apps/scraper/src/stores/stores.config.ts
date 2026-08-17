/**
 * Single source of truth for store registration.
 *
 * ## Adding a new Shopify store — checklist
 *
 * 1. Add an entry to STORE_REGISTRY below, with a `shopify: { collectionHandle }` block.
 * 2. Add to package.json for manual testing (e.g. "scrape:newstore": "tsx src/stores/run-store.ts new_store").
 * 3. Run seed:  docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed
 * 4. Test run: docker compose run --rm scraper pnpm --filter @mtg-au/scraper scrape:stores
 *
 * No scraper code changes are needed for Shopify stores. seedStores() (seed.ts)
 * and the web app's shipping fallback both derive from this file, so a store
 * exists in exactly one place — no more synchronized edits across three files.
 */

// The subset of fields ShopifyScraper actually needs to scrape a store.
// Kept separate from StoreConfig so scraper code and tests can construct
// one without also supplying registration-only fields (name, logoUrl, etc).
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

// The subset of fields CrystalCommerceScraper needs. Same split as
// ShopifyStoreConfig: scraper code and tests can build one without the
// registration-only fields.
export interface CrystalCommerceStoreConfig {
  id: string;              // matches stores.id in DB (e.g. "games_cube")
  baseUrl: string;         // e.g. "https://www.thegamescube.com"
  categoryPrefix: string;  // category slug prefix for MTG singles (e.g. "magic_singles")
  // Safety stop on the per-category pagination loop. With the in-stock filter
  // applied, real categories run 1-3 pages; a much higher number means the
  // "next page" detection has broken and we're looping.
  maxPagesPerCategory: number;
}

export interface StoreConfig {
  id: string;
  name: string;
  baseUrl: string;
  scraperEnabled: boolean;
  logoUrl: string | null;
  // Flat-rate postage estimate in AUD; null = per-item/unknown (e.g. eBay, whose
  // shipping is per-seller and comes back on each store_prices row instead).
  flatShippingAud: number | null;
  // Present only for stores scraped via the generic Shopify scraper.
  shopify?: Omit<ShopifyStoreConfig, "id" | "baseUrl">;
  // Present only for stores scraped via the generic CrystalCommerce scraper.
  crystalCommerce?: Omit<CrystalCommerceStoreConfig, "id" | "baseUrl">;
}

export const STORE_REGISTRY: StoreConfig[] = [
  { id: "mtg_mate", name: "MTG Mate", baseUrl: "https://www.mtgmate.com.au", scraperEnabled: true, logoUrl: null, flatShippingAud: 6.50 },
  {
    id: "good_games", name: "Good Games", baseUrl: "https://tcg.goodgames.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-all-products" },
  },
  {
    id: "gameology", name: "Gameology", baseUrl: "https://www.gameology.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 10.00, shopify: { collectionHandle: "magic-the-gathering-singles" },
  },
  {
    id: "plenty_of_games", name: "Plenty of Games", baseUrl: "https://plentyofgames.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 7.00, shopify: { collectionHandle: "mtg-singles-all-products" },
  },
  {
    id: "games_portal", name: "Games Portal", baseUrl: "https://gamesportal.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "magic-singles-instock" },
  },
  {
    id: "guf", name: "GUF", baseUrl: "https://guf.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-instock-all-stores", locationVariants: true },
  },
  {
    id: "inn_games", name: "Inn Games", baseUrl: "https://inngames.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-instock" },
  },
  {
    id: "irresistible_force", name: "Irresistible Force", baseUrl: "https://tcg.irresistibleforce.com.au", scraperEnabled: true,
    logoUrl: "https://tcg.irresistibleforce.com.au/cdn/shop/files/IF_TCG-01_50757609-f096-420c-869a-3521e3059de4.png?v=1755745472&width=180",
    flatShippingAud: 6.50, shopify: { collectionHandle: "magic-the-gathering-singles" },
  },
  {
    id: "legends_and_collectables", name: "Legends & Collectables", baseUrl: "https://legendsandcollectables.com", scraperEnabled: true,
    logoUrl: "https://www.legendsandcollectables.com/cdn/shop/files/Legends_and_collectables_logo_large.png?v=1651373462",
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-all-products" },
  },
  {
    id: "lots_moore", name: "Lots Moore", baseUrl: "https://online.lotsmoore.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-instock" },
  },
  {
    id: "mana_market", name: "Mana Market", baseUrl: "https://manamarket.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "magic-the-gathering-singles" },
  },
  {
    id: "pro_gamers", name: "Pro Gamers", baseUrl: "https://progamers.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-instock" },
  },
  {
    id: "rhystic_nostalgia", name: "Rhystic Nostalgia Gaming", baseUrl: "https://rhysticnostalgiagaming.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-instock" },
  },
  {
    id: "tabernacle_games", name: "Tabernacle Games", baseUrl: "https://tcg.tabernaclegames.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-instock" },
  },
  {
    id: "cardhouse", name: "Cardhouse", baseUrl: "https://www.cardhouse.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles" },
  },
  {
    id: "tcg_singles", name: "TCG Singles", baseUrl: "https://tcgsingles.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 8.50, shopify: { collectionHandle: "mtg-singles-instock" },
  },
  {
    id: "chromatic_games", name: "Chromatic Games", baseUrl: "https://chromaticgamestcg.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-in-stock" },
  },
  {
    id: "general_games", name: "General Games", baseUrl: "https://www.generalgames.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles" },
  },
  {
    id: "elemental_arcade", name: "Elemental Arcade", baseUrl: "https://elementalarcade.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "magic-the-gathering-tcg-singles" },
  },
  {
    id: "ronin_games", name: "Ronin Games", baseUrl: "https://roningames.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-instock" },
  },
  {
    id: "from_the_deep", name: "From the Deep Games", baseUrl: "https://fromthedeepgames.com.au", scraperEnabled: true,
    logoUrl: "https://fromthedeepgames.com.au/cdn/shop/files/FROMTHE_DEEP_logo-01_-_Chris_Senior_2_large.png?v=1639066356",
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-instock" },
  },
  {
    id: "crit_hit", name: "Crit Hit", baseUrl: "https://www.crithit.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "magic-the-gathering-singles" },
  },
  {
    id: "hr_games", name: "HR Games", baseUrl: "https://hrgames.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "magic-the-gathering-singles" },
  },
  {
    id: "mega_games", name: "Mega Games", baseUrl: "https://www.megagames.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles" },
  },
  {
    id: "ozzie_collectables", name: "Ozzie Collectables", baseUrl: "https://www.ozziecollectables.com", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles" },
  },
  {
    id: "playmantis", name: "Playmantis", baseUrl: "https://playmantis.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "magic-the-gathering-singles" },
  },
  {
    id: "raptor_games", name: "Raptor Games", baseUrl: "https://raptorgames.com", scraperEnabled: true,
    logoUrl: "https://raptorgames.com/cdn/shop/files/TEAMRAPTOR.png?v=1738217064&width=600",
    flatShippingAud: 6.50, shopify: { collectionHandle: "magic-the-gathering-singles", titleFormat: "all-in-title" },
  },
  {
    id: "kastle_cards_and_games", name: "Kastle Cards & Games", baseUrl: "https://kastlecardsandgames.com", scraperEnabled: true,
    logoUrl: "https://kastlecardsandgames.com/cdn/shop/files/600259512_122106647535159492_7530305649160251594_n.jpg?height=200&v=1767776369",
    flatShippingAud: 6.50, shopify: { collectionHandle: "magic-the-gathering" },
  },
  {
    id: "shuffled", name: "Shuffled", baseUrl: "https://shuffled.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-instock" },
  },
  {
    id: "the_card_hub_australia", name: "The Card Hub Australia", baseUrl: "https://thecardhubaustralia.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles" },
  },
  {
    id: "that_game_store", name: "That Game Store", baseUrl: "https://thatgamestore.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-australia-instock" },
  },
  {
    id: "area52", name: "Area52", baseUrl: "https://singles.area52.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles-instock" },
  },
  {
    id: "shuffle_and_cut_games", name: "Shuffle and Cut Games", baseUrl: "https://shuffleandcutgames.com", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 6.50, shopify: { collectionHandle: "mtg-singles" },
  },
  {
    id: "the_games_district", name: "The Games District", baseUrl: "https://thegamesdistrict.com", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 7.0, shopify: { collectionHandle: "mtg-singles" },
  },
  {
    id: "the_hall_of_heroes", name: "The Hall Of Heroes", baseUrl: "https://thehallofheroes.com.au", scraperEnabled: true, logoUrl: null,
    flatShippingAud: 10.0, shopify: { collectionHandle: "mtg-singles-all-products" },
  },
  {
    // Disabled pending permission from the store: robots.txt disallows all
    // non-Googlebot crawlers, and a sweep is ~3,500 requests that visibly
    // degrades their server (see the CrystalCommerce section in CLAUDE.md).
    // The scraper itself works — flip this to true to bring it into the run.
    id: "games_cube", name: "The Games Cube", baseUrl: "https://www.thegamescube.com", scraperEnabled: false, logoUrl: null,
    flatShippingAud: 6.50, crystalCommerce: { categoryPrefix: "magic_singles", maxPagesPerCategory: 25 },
  },
  { id: "mtg_singles_aus", name: "MTG Singles Australia", baseUrl: "https://www.mtgsinglesaustralia.com.au", scraperEnabled: false, logoUrl: null, flatShippingAud: null },
  { id: "ebay_au", name: "eBay AU", baseUrl: "https://www.ebay.com.au", scraperEnabled: true, logoUrl: null, flatShippingAud: null },
];

/** Registry entries that are scraped via the generic Shopify scraper. */
export function shopifyStores(): ShopifyStoreConfig[] {
  return STORE_REGISTRY.filter(
    (s): s is StoreConfig & { shopify: NonNullable<StoreConfig["shopify"]> } => s.shopify !== undefined
  ).map((s) => ({ id: s.id, baseUrl: s.baseUrl, ...s.shopify }));
}

/** Registry entries that are scraped via the generic CrystalCommerce scraper. */
export function crystalCommerceStores(): CrystalCommerceStoreConfig[] {
  return STORE_REGISTRY.filter(
    (s): s is StoreConfig & { crystalCommerce: NonNullable<StoreConfig["crystalCommerce"]> } =>
      s.crystalCommerce !== undefined
  ).map((s) => ({ id: s.id, baseUrl: s.baseUrl, ...s.crystalCommerce }));
}
