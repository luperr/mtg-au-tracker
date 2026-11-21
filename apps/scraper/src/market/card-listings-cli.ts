/**
 * Manual rebuild of card_listings (market/card-listings.ts). It runs on its own after every scrape
 * lane, run-store.ts and the eBay import; this is for after a bulk data fix, or to check timing.
 * Always safe: it rebuilds from store_prices and swaps in atomically.
 */

import { rebuildCardListings } from "./card-listings.js";

rebuildCardListings("manual").then(() => process.exit(0));
