/**
 * eBay Browse API client — searches eBay AU for MTG card listings.
 *
 * Uses the "search" endpoint with:
 *   - Marketplace: EBAY_AU (Australian listings only)
 *   - Category: 2536 (Collectible Card Games — Magic: The Gathering)
 *   - Condition filter: excludes 1000 (Factory Sealed) — singles only
 *   - Buying option: FIXED_PRICE only (Buy It Now)
 *   - Pagination: iterates all pages up to maxPagesPerSet per query
 *
 * eBay API docs: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
 *
 * Environment variables:
 *   EBAY_PAGES_PER_SET — max pages per set search (default: 5, each page = 200 items = 1,000/set)
 */

import { getAccessToken, MARKETPLACE_ID } from "./oauth.js";
import { logger } from "../lib/logger.js";
import {
  EBAY_MTG_CATEGORY_ID,
  EBAY_PAGE_SIZE,
  EBAY_REQUEST_DELAY_MS,
  EBAY_MAX_RETRIES,
  EBAY_RETRY_BACKOFF_MS,
  EBAY_API_BASE,
  EBAY_ENV,
  EBAY_PAGES_PER_SET,
  EBAY_PAGES_PER_CARD,
} from "../lib/config.js";

const log = logger.child({ component: "ebay-browse" });

// eBay condition IDs:
//   1000 = New / Factory Sealed  ← exclude (sealed product, not singles)
//   1500 = New other
//   2500 = Excellent (often graded — title filter in transform.ts catches slabs)
//   2750 = Very Good
//   3000 = Good
//   4000 = Acceptable
//   5000 = For parts or not working
const CONDITION_FILTER = "conditions:{1500|2500|2750|3000|4000|5000}";

export interface EbayShippingOption {
  shippingCostType: string;  // "FIXED", "FREE", "CALCULATED", etc.
  shippingCost?: {
    value: string;           // AUD amount as string e.g. "4.95"
    currency: string;        // "AUD"
  };
}

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
  /** Shipping options — populated when fieldgroups=EXTENDED is requested */
  shippingOptions?: EbayShippingOption[];
}

interface SearchResponse {
  itemSummaries?: EbayItemSummary[];
  total: number;
  limit: number;
  offset: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fetch one page from the eBay Browse API with retry on 429.
 */
async function fetchPage(
  url: string,
  headers: Record<string, string>,
  query: string,
  page: number,
): Promise<SearchResponse> {
  for (let attempt = 0; attempt <= EBAY_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const wait = EBAY_RETRY_BACKOFF_MS[attempt - 1] ?? 30_000;
      log.warn({ query, page, attempt, max_retries: EBAY_MAX_RETRIES, wait_ms: wait }, "Rate limited — waiting before retry");
      await sleep(wait);
    }

    const res = await fetch(url, { headers });

    if (res.status === 429) {
      if (attempt === EBAY_MAX_RETRIES) {
        throw new Error(`eBay Browse API rate limit exceeded after ${EBAY_MAX_RETRIES} retries for "${query}" page ${page}`);
      }
      continue; // retry after backoff
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`eBay Browse API error (${res.status}) for "${query}" page ${page}: ${body}`);
    }

    return res.json() as Promise<SearchResponse>;
  }
  throw new Error("unreachable");
}

/**
 * Search eBay AU for a specific query and yield all matching items up to maxPages.
 * Used internally — callers use searchEbayBySet() / searchEbayByCardName().
 *
 * Rate-limited: waits REQUEST_DELAY_MS between each page request.
 */
async function* searchEbay(query: string, maxPages: number): AsyncGenerator<EbayItemSummary> {
  const token = await getAccessToken();
  const base = EBAY_API_BASE[EBAY_ENV];

  const params = new URLSearchParams({
    q: query,
    category_ids: EBAY_MTG_CATEGORY_ID,
    limit: EBAY_PAGE_SIZE.toString(),
    offset: "0",
    filter: `buyingOptions:{FIXED_PRICE},${CONDITION_FILTER},itemLocationCountry:AU`,
    fieldgroups: "EXTENDED",   // includes shippingOptions in each item summary
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
    "X-EBAY-C-ENDUSERCTX": "contextualLocation=country=AU",
    "Content-Type": "application/json",
  };

  let page = 0;
  let totalFetched = 0;

  while (page < maxPages) {
    params.set("offset", (page * EBAY_PAGE_SIZE).toString());

    // Rate limit: pause before every request (including the first, so back-to-back
    // card-name searches each get their own delay window)
    await sleep(EBAY_REQUEST_DELAY_MS);

    const data = await fetchPage(`${base}/item_summary/search?${params}`, headers, query, page);
    const items = data.itemSummaries ?? [];

    if (items.length === 0) break;

    for (const item of items) {
      yield item;
    }

    totalFetched += items.length;

    if (totalFetched >= data.total) break;
    page++;
  }
}

/**
 * Search eBay AU for singles from a specific set name.
 * Query: "magic the gathering [setName]"
 * Returns up to EBAY_PAGES_PER_SET × 200 items.
 */
export async function* searchEbayBySet(setName: string): AsyncGenerator<EbayItemSummary> {
  const query = `magic the gathering ${setName}`;
  yield* searchEbay(query, EBAY_PAGES_PER_SET);
}

/**
 * Search eBay AU for a specific card name.
 * Query: "[cardName] mtg"
 * Returns up to EBAY_PAGES_PER_CARD × 200 items (default: 1 page = 200 results).
 * Used for recent-set cards and high-value cards where targeted results matter.
 */
export async function* searchEbayByCardName(cardName: string): AsyncGenerator<EbayItemSummary> {
  const query = `${cardName} mtg`;
  yield* searchEbay(query, EBAY_PAGES_PER_CARD);
}

// ── Run directly to test ───────────────────────────────────────────────────────
// tsx src/ebay/browse-client.ts
if (process.argv[1]?.endsWith("browse-client.ts") || process.argv[1]?.endsWith("browse-client.js")) {
  console.log("Testing searchEbayBySet for 'Dominaria United'...\n");

  let count = 0;
  for await (const item of searchEbayBySet("Dominaria United")) {
    console.log(`[${count + 1}] ${item.title}`);
    console.log(`     $${item.price?.value} AUD | ${item.condition}`);
    count++;
    if (count >= 10) break;
  }
  console.log(`\nFetched ${count} items`);
  process.exit(0);
}
