# Analytics & Data Quality

## Match Rate

Every scraped card goes through the 6-level matching pipeline in `card-matcher.ts`. The result is tracked in Prometheus gauges:

- `cards_scraped` — total products seen per store per run
- `match_rate` — fraction successfully matched (level 0–5), per store
- `scrape_duration_seconds` — wall time per store

A `match_rate` below ~0.6 for a Shopify store usually means the `collectionHandle` is wrong (fetching non-MTG products). Use `validate:all-stores` to diagnose.

For eBay, match rates of 0.5–0.7 are typical because eBay titles are unstructured. Improve rates by running `suggest:aliases` and adding `SET_ALIASES` entries.

---

## Market Movers

`compute-market-stats.ts` runs after each scrape run. It calculates:

- **Gainers** — cards whose cheapest in-stock price has increased by ≥1% vs N days ago
- **Losers** — cards whose cheapest in-stock price has decreased by ≥1% vs N days ago

### How the baseline is computed

The `baseline` CTE finds the oldest price-history snapshot within the lookback window (default 7 days) for each card. The `current_price` CTE finds the cheapest current in-stock price for each card across any store.

**Previous bug (fixed April 2026)**: The baseline CTE previously joined `store_prices` to verify the exact same store still stocked the card. This caused cards that moved from Store A to Store B to be invisible to the algorithm — they never appeared as movers even if the price genuinely changed. The join has been removed. The baseline is now purely historical price data.

### Thresholds

```ts
// packages/shared/src/constants.ts
TREND_UP_THRESHOLD = 1.01    // 1% gain
TREND_DOWN_THRESHOLD = 0.99  // 1% loss
```

These constants are shared between the scraper (compute-market-stats.ts) and the web app (trend badges).

---

## Set Analytics

The `/sets/[setCode]` page shows:

- **Market Pulse** — top gainers and losers within the set
- **Price Timeline** — area chart of cheapest price across the set over time
- **Rarity Breakdown** — average price per rarity
- **Crash Curve** — price movement from release date, by rarity

All data comes from `price_history` snapshots.

---

## Demand-Gap Analytics

`card_searches` records every search query from the web UI, with the top result's `card_id` attached (best-effort attribution).

A demand-gap query joins `card_searches` against `store_prices` to find cards users searched for but that have zero in-stock listings. These are the cards most worth sourcing.

The dashboard UI for demand-gap is a planned Phase 3 feature — the data collection is already live.

---

## eBay vs Store Prices

eBay prices reflect secondary market (player-to-player) prices. Store prices are retail. Typical relationships:

- **eBay < Store**: The card is widely available; stores priced it high
- **eBay > Store**: The store is a good deal; the card is in demand
- **eBay only**: The card isn't stocked by any tracked AU store
- **Store only**: The card exists on eBay but below the search threshold, or too recently released

---

## Silent Failure Detection

### Shopify stores

After each store scrape, `scrapeAll()` now emits `log.error` in two cases:

1. `totalProducts === 0` — the endpoint returned nothing. Likely: wrong URL, wrong handle, or auth issue. Grafana label: `likely_cause: "endpoint_404_or_empty_collection"`
2. `totalProducts > 0 && totalCards === 0` — products exist but zero are MTG cards. Likely: the collection handle points to a non-MTG collection. Grafana label: `likely_cause: "handle_returns_wrong_product_type"`

Use `pnpm --filter @mtg-au/scraper validate:all-stores` to interactively diagnose all stores.

### eBay

eBay import logs a `log.error` if it completes with zero cards matched. The `suggest:aliases` tool analyses the `unmatched_cards` table to find patterns that can be turned into `SET_ALIASES` entries.
