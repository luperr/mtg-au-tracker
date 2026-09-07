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

// ── Search ranking ───────────────────────────────────────────────────────────

/**
 * Shortest query we will run. Below three characters pg_trgm cannot extract a full
 * trigram, so `cards_name_trgm_idx` is unusable and the ILIKE degrades to a seq scan
 * of every card — the one thing this hardware cannot absorb on a hot path.
 */
export const SEARCH_MIN_QUERY_LENGTH = 3;

/**
 * Most candidate rows we rank before paging. Bounds the sort: a deliberately broad
 * query ('the' matches 3,392 cards) would otherwise sort its whole match set on every
 * page request. Ranking happens *inside* the capped CTE, so the cap keeps the best
 * matches rather than an arbitrary slice — and totalCount becomes a floor once hit.
 */
export const SEARCH_CANDIDATE_CAP = 2000;

/**
 * Cutoff for the fuzzy fallback pass, stated explicitly rather than inherited from
 * pg_trgm.word_similarity_threshold — that GUC is a server-level setting a pooled
 * connection cannot reliably carry, so relying on it makes results depend on which
 * connection served the request. 0.6 matches the Postgres default and was measured
 * against real data: a one-character typo scores 0.71 (kept), three characters of
 * damage scores 0.26 (rejected).
 */
export const SEARCH_FUZZY_MIN_SIMILARITY = 0.6;
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
export const GITHUB_API_URL = "https://api.github.com";

// ── eBay Partner Network (affiliate) ─────────────────────────────────────────
//
// The campaign id itself is runtime config (EBAY_AFFILIATE_CAMPAIGN_ID) and has no
// default: unset means outbound eBay links render exactly as they always did.
// See apps/web/src/lib/affiliate.ts.

/**
 * EPN rotation id for the eBay AU site. Overridable via EBAY_AFFILIATE_ROTATION_ID.
 * Verify this against a link generated in the EPN dashboard — a wrong rotation id
 * loses attribution silently rather than erroring.
 */
export const EBAY_AFFILIATE_ROTATION_ID_DEFAULT = "705-53470-19255-0";

/** eBay site id for ebay.com.au. */
export const EBAY_AFFILIATE_SITE_ID = "15";

/** EPN tool id for a standard text/link placement. */
export const EBAY_AFFILIATE_TOOL_ID = "10001";

// ── GitHub issue creation ────────────────────────────────────────────────────

export const GITHUB_REPO_OWNER = "luperr";
export const GITHUB_REPO_NAME = "mtg-au-tracker";
