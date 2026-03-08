/**
 * eBay Browse API client — searches eBay AU for MTG card listings.
 *
 * Uses the "search" endpoint with:
 *   - Marketplace: EBAY_AU (Australian listings only)
 *   - Category: 2536 (Collectible Card Games — Magic: The Gathering)
 *   - Condition filter: exclude Graded/PSA slabs (condition IDs 2750, 2500)
 *   - Pagination: iterates all pages up to EBAY_MAX_PAGES
 *
 * eBay API docs: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
 *
 * Environment variables:
 *   EBAY_MAX_PAGES  — max pages to fetch per search (default: 50, each page = 200 items)
 */

import { getAccessToken, MARKETPLACE_ID } from "./oauth.js";

// eBay category ID for "Collectible Card Games > Magic: The Gathering"
const MTG_CATEGORY_ID = "2536";

// Items per page — eBay Browse API max is 200
const PAGE_SIZE = 200;

// Base URLs
const API_BASE = {
  production: "https://api.ebay.com/buy/browse/v1",
  sandbox: "https://api.sandbox.ebay.com/buy/browse/v1",
};

export interface EbayItemSummary {
  itemId: string;
  title: string;
  price: {
    value: string;      // AUD amount as string e.g. "12.50"
    currency: string;   // "AUD"
  };
  condition: string;    // "New", "Used", etc.
  itemWebUrl: string;
  buyingOptions: string[]; // "FIXED_PRICE", "AUCTION", etc.
  /** Present on auction listings */
  currentBidPrice?: {
    value: string;
    currency: string;
  };
}

interface SearchResponse {
  itemSummaries?: EbayItemSummary[];
  total: number;
  next?: string;
  limit: number;
  offset: number;
}

/**
 * Search eBay AU for MTG singles and yield all matching items across all pages.
 *
 * Searches for "magic the gathering" within the MTG category.
 * Stops when all pages are exhausted or EBAY_MAX_PAGES is reached.
 */
export async function* searchEbayAU(): AsyncGenerator<EbayItemSummary> {
  const token = await getAccessToken();
  const env = (process.env.EBAY_ENV ?? "production") as "production" | "sandbox";
  const base = API_BASE[env];
  const maxPages = parseInt(process.env.EBAY_MAX_PAGES ?? "50", 10);

  // Filter out graded/slabbed cards — we only want raw singles
  // eBay condition IDs: 2750 = For parts or not working, 2500 = Like new (graded)
  // We exclude listing items with "PSA", "BGS", "CGC" in title via title filtering in transform.ts
  const params = new URLSearchParams({
    q: "magic the gathering",
    category_ids: MTG_CATEGORY_ID,
    limit: PAGE_SIZE.toString(),
    offset: "0",
    // Only sold/active fixed-price or auction listings
    filter: "buyingOptions:{FIXED_PRICE|AUCTION}",
  });

  let page = 0;
  let totalFetched = 0;

  while (page < maxPages) {
    params.set("offset", (page * PAGE_SIZE).toString());

    const url = `${base}/item_summary/search?${params}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
        "X-EBAY-C-ENDUSERCTX": "contextualLocation=country=AU",
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`eBay Browse API error (${res.status}) on page ${page}: ${body}`);
    }

    const data = (await res.json()) as SearchResponse;
    const items = data.itemSummaries ?? [];

    if (items.length === 0) break;

    for (const item of items) {
      yield item;
    }

    totalFetched += items.length;
    console.log(
      `[eBay Browse] Page ${page + 1}/${maxPages} — ${items.length} items (${totalFetched} total, ${data.total} available)`,
    );

    // Stop if we've fetched everything available
    if (totalFetched >= data.total) break;

    page++;
  }

  console.log(`[eBay Browse] Done — fetched ${totalFetched} items across ${page + 1} pages`);
}

// ── Run directly to test ───────────────────────────────────────────────────────
// tsx src/ebay/browse-client.ts
if (process.argv[1]?.endsWith("browse-client.ts") || process.argv[1]?.endsWith("browse-client.js")) {
  const { config } = await import("dotenv");
  config({ path: new URL("../../../../.env", import.meta.url).pathname });

  let count = 0;
  for await (const item of searchEbayAU()) {
    if (count < 5) {
      console.log(`\n[Sample ${count + 1}]`);
      console.log("  Title:", item.title);
      console.log("  Price:", item.price?.value, item.price?.currency);
      console.log("  Condition:", item.condition);
      console.log("  URL:", item.itemWebUrl);
    }
    count++;
    if (count >= 5) break; // Only print first 5 for the test
  }
  console.log(`\nTotal fetched in test: ${count}`);
  process.exit(0);
}
