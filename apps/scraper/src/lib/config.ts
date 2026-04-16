/**
 * Centralized configuration for the scraper service.
 *
 * All environment variable reads and tunable constants live here.
 * Import from this module instead of reading process.env directly.
 */

// ── Database ─────────────────────────────────────────────────────────────────

export const DATABASE_URL = process.env.DATABASE_URL;

// ── Scheduling ───────────────────────────────────────────────────────────────

export const CRON_TIMEZONE = "Australia/Sydney";
export const CRON_SCRYFALL = process.env.SCRAPE_CRON_SCRYFALL ?? "0 3 * * *";
export const CRON_STORES = process.env.SCRAPE_CRON_STORES ?? "0 5 * * *";
export const CRON_EBAY = process.env.SCRAPE_CRON_EBAY ?? "0 6 * * *";
export const CRON_MARKET = process.env.SCRAPE_CRON_MARKET ?? "0 7 * * *"; // fallback after eBay import

// ── Batch processing ─────────────────────────────────────────────────────────

/** Shared batch size for all DB bulk inserts (store prices, history, printings) */
export const BATCH_SIZE = 500;

// ── Scryfall ─────────────────────────────────────────────────────────────────

export const SCRYFALL_BULK_API_URL =
  process.env.SCRYFALL_BULK_URL ?? "https://api.scryfall.com/bulk-data";
export const SCRYFALL_OUTPUT_DIR = "/tmp/mtg-scraper";
export const SCRYFALL_USER_AGENT = "Scrymarket/1.0 (learning project)";

// ── eBay ─────────────────────────────────────────────────────────────────────

export const EBAY_STORE_ID = "ebay_au";

export const EBAY_ENV = (process.env.EBAY_ENV ?? "production") as "production" | "sandbox";
export const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
export const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;

export const EBAY_DAILY_TARGET = parseInt(process.env.EBAY_DAILY_TARGET ?? "4500", 10);
export const EBAY_PAGES_PER_SET = parseInt(process.env.EBAY_PAGES_PER_SET ?? "5", 10);
export const EBAY_PAGES_PER_CARD = parseInt(process.env.EBAY_PAGES_PER_CARD ?? "1", 10);

/** Items per page — eBay Browse API max is 200 */
export const EBAY_PAGE_SIZE = 200;

/** Minimum delay between API calls (ms) */
export const EBAY_REQUEST_DELAY_MS = 500;

/** Retry config for 429 Too Many Requests */
export const EBAY_MAX_RETRIES = 3;
export const EBAY_RETRY_BACKOFF_MS = [5_000, 15_000, 30_000];

/** eBay category ID for "Collectible Card Games > Magic: The Gathering" */
export const EBAY_MTG_CATEGORY_ID = "2536";

export const EBAY_API_BASE = {
  production: "https://api.ebay.com/buy/browse/v1",
  sandbox: "https://api.sandbox.ebay.com/buy/browse/v1",
};

export const EBAY_TOKEN_URL = {
  production: "https://api.ebay.com/identity/v1/oauth2/token",
  sandbox: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
};

// ── Browser / HTTP ───────────────────────────────────────────────────────────

export const USER_AGENT =
  process.env.USER_AGENT ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0";

// ── MTG Mate ─────────────────────────────────────────────────────────────────

export const MTGMATE_BASE_URL = "https://www.mtgmate.com.au";
export const MTGMATE_CONCURRENCY = 3;
