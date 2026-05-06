// Price trend thresholds — shared between scraper (compute-market-stats) and web (TrendBadge, config).
// Current price must exceed hist × TREND_UP to show ↑; must be below hist × TREND_DOWN to show ↓.
export const TREND_UP_THRESHOLD = 1.01;
export const TREND_DOWN_THRESHOLD = 0.99;
