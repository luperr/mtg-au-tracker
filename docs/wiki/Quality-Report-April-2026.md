# Quality Report — April 2026

*Contrasted against the March 2026 review (`docs/scrymarket-review.html`). Changes landed on branch `claude/refactor-code-quality-JzIvu`.*

---

## Score Comparison

| Dimension | March 2026 | April 2026 | Delta | Notes |
|-----------|:----------:|:----------:|:-----:|-------|
| Architecture | A | A | — | Structure unchanged and correct |
| Data Model | A | A | — | Schema sound; market movers bug was query-level, not schema |
| Security | A | A+ | ↑ | Rate limiting on all 9 routes (was 2 of 9) |
| Observability | A− | A | ↑ | Zero-card Shopify failures now `log.error`; 7 routes have structured error logging |
| Test Coverage | D | C+ | ↑↑ | 125 new tests; B&B algorithm, DB contract, tool logic all covered |
| Documentation | A | A+ | ↑ | This wiki |

---

## Critical Bug Fixed

### Market Movers Baseline CTE

**Root cause of wrong/useless dashboard data.**

The `baseline` CTE in `compute-market-stats.ts` joined `store_prices` to check if the *exact same store* still stocked a card before including it as a price mover. Cards that moved from Store A to Store B were invisible to the algorithm — they never appeared as movers even if the price genuinely changed.

```sql
-- BEFORE (buggy): requires sp_check.store_id = ph.store_id
FROM price_history ph
JOIN printings p ON p.id = ph.printing_id
JOIN store_prices sp_check ON sp_check.printing_id = ph.printing_id
  AND sp_check.store_id = ph.store_id   ← wrong join
  AND sp_check.in_stock = true

-- AFTER: historical baseline is independent of current stock location
FROM price_history ph
JOIN printings p ON p.id = ph.printing_id
```

This fix applies to both the gainers and losers CTEs.

---

## Security Improvements

7 API routes gained rate limiting. Previously only `/api/search` (30/min) and `/api/contact` (10/min) were protected.

| Route | Limit | Risk without protection |
|-------|-------|------------------------|
| `POST /api/cards/bulk-lookup` | 10/min | Heavy DB query over many card IDs |
| `POST /api/optimize` | 5/min | CPU-intensive B&B algorithm |
| `GET /api/cards/store-printings` | 120/min | DB query per request |
| `GET /api/contact/printings` | 120/min | DB query per request |
| `GET /api/contact/stores` | 120/min | DB query per request |
| `GET /api/top-movers` | 120/min | Complex CTE query |

---

## Observability Improvements

**Shopify silent failures**: `scrapeAll()` previously only emitted `log.warn` with a `NaN%` match rate when a store produced zero cards. This was invisible in Grafana dashboards. Now emits `log.error` with `likely_cause` label distinguishing two failure modes:

- `endpoint_404_or_empty_collection` — store returned zero products
- `handle_returns_wrong_product_type` — products returned but zero were MTG cards

**API error handling**: 7 routes had no error handling (`console.error` or nothing). All 9 routes now use a shared `withErrorHandler()` wrapper with consistent pino structured logging and `{ error: "Internal server error" }` response format.

---

## Test Coverage

### Before: 160 tests

All 160 existing tests covered:
- Card matcher (all 6 match levels, borderless sort)
- `normalizeName()` and `normalizeSetName()` (edge cases)
- Scryfall transform
- eBay title parser
- Shopify parser (`isTokenOrEmblem`, `parseSkuData`, `parseProductTitle`, `isSkippedVariant`)
- `getClientIp()`

### After: 285 tests (+125)

| New file | Tests | What's covered |
|----------|-------|----------------|
| `optimize/route.test.ts` | 7 | B&B algorithm correctness |
| `cards/bulk-lookup/route.test.ts` | 6 | NUMERIC→float DB contract |
| `tools/validate-stores.test.ts` | 8 | Issue classification logic |
| `tools/suggest-improvements.test.ts` | 10 | Alias confidence tiers |

The B&B optimizer was the highest-risk untested code — a subtle algorithm bug could produce wrong store suggestions or incorrect total costs. `rowToResult` silently returns `NaN` prices if the DB NUMERIC→string contract is broken; the test catches that.

### Still not tested (known gaps)

- `apps/web/src/lib/db.ts` — integration tests, require a live database
- React components — snapshot tests are maintenance burden
- Playwright end-to-end — infrastructure not yet set up

---

## Code Quality Improvements

| Issue | Fix |
|-------|-----|
| `TREND_UP_THRESHOLD` / `TREND_DOWN_THRESHOLD` defined in 2 places | Moved to `packages/shared/src/constants.ts` |
| `fmtAUD()` defined in 2 places | Removed duplicate from `MarketPulse.tsx` |
| No `tailwind.config.ts` → no IDE autocomplete for `bg-surface` etc. | Added `apps/web/tailwind.config.ts` |
| Stale hex fallbacks in chart components | Updated to match current `globals.css` palette |
| No documentation of CSS token system | Added header comment to `globals.css` |

---

## New Tools

### `validate:all-stores`

```bash
pnpm --filter @mtg-au/scraper validate:all-stores
```

Probes all 21 Shopify store configs. Outputs a pass/fail table with issue codes (`ENDPOINT_404`, `EMPTY_COLLECTION`, `PARSER_REJECTS_ALL`, `LOW_SET_COVERAGE`). Exit code 1 if any critical issue found. JSON to stdout for piping.

### `suggest:aliases`

```bash
pnpm --filter @mtg-au/scraper suggest:aliases
```

Analyses `unmatched_cards` for `store_id = 'ebay_au'`. Outputs paste-ready `SET_ALIASES` entries with confidence tiers and name correction suggestions. Never writes to `matching.ts` — human review required.

---

## What Remains

| Item | Priority | Notes |
|------|----------|-------|
| DB integration tests | Medium | Requires CI with test database |
| Live AUD/USD rate | Low | Replace static `AUD_USD_RATE` env var |
| eBay atomic swap | Medium | Eliminate zero-price window on interrupted runs |
| MTG Mate set code cache | Low | Reduce 30m → 3m full rescan |
| GitHub Actions CI | High | typecheck + audit + test on PR |
| Demand-gap dashboard | Low | Data collection is live, UI is Phase 3 |
