/**
 * Shopify store configurations.
 *
 * ## Adding a new Shopify store — checklist
 *
 * 1. Add an entry to SHOPIFY_STORES below (id, baseUrl, collectionHandle).
 * 2. Add the store to STORES in apps/scraper/src/seed.ts (scraperEnabled: true).
 * 3. Add flat-rate postage to STORE_FLAT_SHIPPING_AUD in
 *    apps/web/src/lib/store-shipping.ts (use null if postage varies).
 * 4. Run seed:  docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed
 * 5. Test run: docker compose run --rm scraper pnpm --filter @mtg-au/scraper scrape:stores
 *
 * No scraper code changes are needed for Shopify stores.
 */

export interface ShopifyStoreConfig {
  id: string;               // matches stores.id in DB (e.g. "good_games")
  baseUrl: string;          // e.g. "https://tcg.goodgames.com.au"
  collectionHandle: string; // Shopify collection slug (e.g. "mtg-singles-all-products")
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
];
