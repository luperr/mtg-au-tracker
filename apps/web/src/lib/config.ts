/**
 * Centralized configuration for the web app.
 *
 * All tunable constants and magic numbers live here.
 * Import from this module instead of hardcoding values inline.
 */

// ── Rate limits ──────────────────────────────────────────────────────────────

export const RATE_LIMIT_SEARCH_PER_MINUTE = 60;
export const RATE_LIMIT_CONTACT_PER_HOUR = 3;
export const RATE_LIMIT_BULK_LOOKUP_PER_MINUTE = 10;
export const RATE_LIMIT_OPTIMIZE_PER_MINUTE = 5;
export const RATE_LIMIT_READ_PER_MINUTE = 120;

// ── Want List optimiser ──────────────────────────────────────────────────────

/**
 * Wall-clock budget for the exact branch-and-bound pass (ms). Local search has
 * already produced a near-optimal plan before B&B runs; B&B proves optimality
 * for small store counts (finishes in milliseconds) and is cut off here for
 * large ones (a typical list touches ~30 stores, where the 2^N search cannot
 * finish in any reasonable budget). The returned plan is always valid — a
 * cutoff just means it isn't *provably* optimal.
 */
export const OPTIMIZE_DEADLINE_MS = 1500;

/**
 * Run the exact branch-and-bound pass only when this many or fewer stores have
 * listings for the want list. Beyond it the 2^N search cannot finish inside the
 * deadline and never beats the local-search plan in practice — skipping it
 * saves the entire deadline budget on broad lists.
 */
export const OPTIMIZE_EXACT_MAX_STORES = 18;

// ── Pagination ───────────────────────────────────────────────────────────────

export const SEARCH_PAGE_SIZE = 20;
export const MAX_SEARCH_OFFSET = 10_000;
export const MAX_BULK_CARDS = 200;
export const MAX_CARD_QTY = 99;

// ── Price trends ─────────────────────────────────────────────────────────────

export { TREND_UP_THRESHOLD, TREND_DOWN_THRESHOLD } from "@mtg-au/shared";

// ── Cache durations (seconds) ────────────────────────────────────────────────

export const CACHE_REVALIDATE_HOUR = 3600;
export const CACHE_SEARCH_MAX_AGE = 300;
export const CACHE_SEARCH_SWR = 600;
export const CACHE_STALE_WHILE_REVALIDATE_DAY = 86400;

// ── Card display ─────────────────────────────────────────────────────────────

/** Standard MTG card aspect ratio (63 mm wide × 88 mm tall). */
export const MTG_CARD_ASPECT_RATIO = "63/88";

// ── Domains & external URLs ──────────────────────────────────────────────────

export const SITE_URL = "https://scrymarket.au";
export const ANALYTICS_SCRIPT_URL = "https://umami.scrymarket.au/script.js";
export const SCRYFALL_SVG_BASE = "https://svgs.scryfall.io";
export const GITHUB_API_URL = "https://api.github.com";

// ── GitHub issue creation ────────────────────────────────────────────────────

export const GITHUB_REPO_OWNER = "luperr";
export const GITHUB_REPO_NAME = "mtg-au-tracker";
