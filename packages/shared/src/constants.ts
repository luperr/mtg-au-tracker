// Price trend thresholds — shared between scraper (compute-market-stats) and web (TrendBadge, config).
// Current price must exceed hist × TREND_UP to show ↑; must be below hist × TREND_DOWN to show ↓.
export const TREND_UP_THRESHOLD = 1.01;
export const TREND_DOWN_THRESHOLD = 0.99;

/**
 * Sent on every request to Scryfall (API, bulk data, card images). Scryfall rejects default
 * library User-Agents ("generic_user_agent") and asks apps to name themselves.
 */
export const SCRYFALL_USER_AGENT = "Scrymarket/1.0 (+https://scrymarket.au)";
