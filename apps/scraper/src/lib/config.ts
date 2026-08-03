/**
 * Centralized configuration for the scraper service.
 *
 * All environment variable reads and tunable constants live here.
 * Import from this module instead of reading process.env directly.
 */

// ── Env parsing ──────────────────────────────────────────────────────────────

/**
 * Read a positive integer from the environment, falling back on anything
 * unusable (unset, empty, non-numeric, zero, negative, fractional).
 *
 * Number()/parseInt() return NaN for a typo'd value, and NaN propagates
 * silently: a NaN concurrency limit makes mapWithConcurrency spawn zero
 * workers, so a run scrapes nothing and still reports success — after the
 * store's prices have already been deleted. Fail back to the default loudly
 * instead.
 */
export function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    process.stderr.write(
      `[config] ${name}="${raw}" is not a positive integer — using default ${fallback}\n`,
    );
    return fallback;
  }
  return parsed;
}

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

export const EBAY_DAILY_TARGET = positiveIntEnv("EBAY_DAILY_TARGET", 4500);
export const EBAY_PAGES_PER_SET = positiveIntEnv("EBAY_PAGES_PER_SET", 5);
export const EBAY_PAGES_PER_CARD = positiveIntEnv("EBAY_PAGES_PER_CARD", 1);

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

/**
 * Timeout for BaseScraper's plain fetch() paths. Node's fetch has no default
 * timeout, so without this a server that accepts a connection and never
 * responds stalls a scrape indefinitely. Matches the Playwright page timeouts.
 */
export const PLAIN_FETCH_TIMEOUT_MS = 30_000;

/**
 * Retries for transient upstream failures (429/502/503/504) on the plain-fetch
 * paths. These are not bot challenges, so the browser fallback can't help — the
 * only useful response is to wait and ask again.
 *
 * Deliberately short and few: a store shedding load wants less traffic, not
 * more. Scrapers with their own retry loop (CrystalCommerce) stack on top of
 * this, so the backoff stays modest to bound the worst case.
 */
export const HTTP_MAX_RETRIES = 2;
export const HTTP_RETRY_BACKOFF_MS = [2_000, 6_000];

// ── MTG Mate ─────────────────────────────────────────────────────────────────

export const MTGMATE_BASE_URL = "https://www.mtgmate.com.au";
export const MTGMATE_CONCURRENCY = 3;

// ── CrystalCommerce ──────────────────────────────────────────────────────────

/** CrystalCommerce drops connections under sustained load — retry before skipping a page. */
export const CC_MAX_RETRIES = 3;
export const CC_RETRY_BACKOFF_MS = [2_000, 5_000, 10_000];

/** Days between full re-scans of every category (vs. only those known to have stock). */
export const CC_FULL_SCAN_DAYS = positiveIntEnv("CC_FULL_SCAN_DAYS", 7);

/**
 * Categories fetched in parallel. CrystalCommerce serves ~30 products/page at
 * ~2.3s TTFB, so a full Games Cube sweep is ~3,500 pages. Measured at 3-wide:
 * 88 min, 1.65x faster than sequential.
 *
 * Only 1.65x rather than 3x because the store's latency roughly doubles under
 * parallel load — it's Passenger-worker-bound. Do not raise without
 * re-measuring: 4-wide returned a 503, i.e. it sheds load. If 503s show up at
 * 3, drop to 2.
 */
export const CC_CONCURRENCY = positiveIntEnv("CC_CONCURRENCY", 3);

// ── Store orchestration ──────────────────────────────────────────────────────

/**
 * Stores scraped in parallel by runAllStores(). Stops one slow store (the Games
 * Cube takes ~1h) from serialising the other 33 behind it.
 *
 * Kept low because a store that hits a bot challenge launches its own Chromium
 * via BaseScraper — this bounds the worst-case number of live browsers.
 */
export const STORE_CONCURRENCY = positiveIntEnv("STORE_CONCURRENCY", 3);
