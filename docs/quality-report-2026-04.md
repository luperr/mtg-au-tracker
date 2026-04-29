# Scrymarket — Quality Report, April 2026

*Contrasted against the March 2026 review (`docs/scrymarket-review.html`). Branch: `claude/refactor-code-quality-JzIvu`.*

---

## Score Comparison

| Dimension | March 2026 | April 2026 | Delta | Notes |
|-----------|:----------:|:----------:|:-----:|-------|
| Architecture | A | A | — | Structure unchanged and correct |
| Data Model | A | A | — | Schema sound; market movers bug was query-level, not schema |
| Security | A | A+ | ↑ | Rate limiting on all 9 routes (was 2 of 9) |
| Observability | A− | A | ↑ | Zero-card Shopify failures now `log.error`; 7 routes now have structured error logging |
| Test Coverage | D | C+ | ↑↑ | 125 new tests; B&B algorithm, DB contract, tool logic all covered |
| Documentation | A | A+ | ↑ | Wiki with architecture, data model, dev guide, quality report |

---

## What Changed

### Bug Fixes

**Market movers baseline CTE** (`apps/scraper/src/market/compute-market-stats.ts`)

The primary root cause of wrong/useless dashboard data. The `baseline` CTE joined `store_prices` to check if the *exact same store* still stocked a card before including it as a price mover. Cards that moved from Store A to Store B were invisible to the algorithm.

```sql
-- BEFORE (buggy): requires sp_check.store_id = ph.store_id
FROM price_history ph
JOIN printings p ON p.id = ph.printing_id
JOIN store_prices sp_check ON sp_check.printing_id = ph.printing_id
  AND sp_check.store_id = ph.store_id   ← wrong
  AND sp_check.in_stock = true

-- AFTER: baseline is historical price, current availability checked separately
FROM price_history ph
JOIN printings p ON p.id = ph.printing_id
```

This fix applies to both the gainers and losers CTEs. The `current_price` CTE already picked the correct in-stock store independently.

---

### Security: Rate Limiting

Previously only 2 of 9 API routes were rate-limited (`/api/search`, `/api/contact`). The 7 unprotected routes included the two most expensive endpoints:

| Route | Limit | Previously |
|-------|-------|-----------|
| `/api/cards/bulk-lookup` | 10/min | Unprotected |
| `/api/optimize` | 5/min | Unprotected |
| `/api/cards/store-printings` | 120/min | Unprotected |
| `/api/contact/printings` | 120/min | Unprotected |
| `/api/contact/stores` | 120/min | Unprotected |
| `/api/top-movers` | 120/min | Unprotected |
| `/api/search` | 30/min | Already protected |
| `/api/contact` | 10/min | Already protected |

Rate limit constants are defined in `apps/web/src/lib/config.ts` and imported across all routes.

---

### Observability: Structured Error Logging

**API routes**: All routes now use a shared `withErrorHandler()` wrapper (`apps/web/src/lib/api-helpers.ts`). This eliminates the inconsistent pattern of `console.error` in some routes and missing error handling in others. All errors now log via pino with `{ err, context }` and return a consistent `{ error: "Internal server error" }` response.

**Shopify silent failures**: `scrapeAll()` in `apps/scraper/src/stores/shopify.ts` now distinguishes between two failure modes that were previously only `log.warn`:

- `totalProducts === 0` → `log.error({ likely_cause: "endpoint_404_or_empty_collection" })` — endpoint not returning data
- `totalProducts > 0 && totalCards === 0` → `log.error({ likely_cause: "handle_returns_wrong_product_type" })` — endpoint returns non-MTG products

Both errors are visible in Grafana/Loki with the `store` label for easy filtering.

**run-all.ts**: Added `log.error` guard when a store produces zero prices after a full scrape run.

---

### Code Quality: Duplication Eliminated

**Shared threshold constants** (`packages/shared/src/constants.ts`)

`TREND_UP_THRESHOLD = 1.01` and `TREND_DOWN_THRESHOLD = 0.99` were defined independently in both `apps/web/src/lib/config.ts` and `apps/scraper/src/market/compute-market-stats.ts`. Both now import from `@mtg-au/shared`.

**`fmtAUD()` duplication**

Was defined identically in `apps/web/src/lib/utils.ts` and `apps/web/src/app/sets/MarketPulse.tsx`. The local copy in `MarketPulse.tsx` has been removed; the component now imports from `@/lib/utils`.

---

### New Tools

**`validate-stores.ts`** (`apps/scraper/src/tools/`)

CLI that probes all 21 Shopify store configs and classifies each with issue codes:
- `ENDPOINT_404` — HTTP non-2xx response
- `EMPTY_COLLECTION` — 200 but zero products returned
- `PARSER_REJECTS_ALL` — products returned but zero MTG cards extracted
- `LOW_SET_COVERAGE` — <50% of mapped cards have a recognised set name

Outputs a human-readable table to stderr and JSON to stdout. Exit code 1 on critical issues. Run with: `pnpm --filter @mtg-au/scraper validate:all-stores`

**`suggest-improvements.ts`** (`apps/scraper/src/tools/`)

Analyses `unmatched_cards` for `store_id = 'ebay_au'` and produces paste-ready `SET_ALIASES` additions with confidence tiers (HIGH/MEDIUM/LOW based on Levenshtein distance). Also suggests name corrections for typos with distance=1 and frequency≥3. Never writes to `matching.ts` directly — human review required. Run with: `pnpm --filter @mtg-au/scraper suggest:aliases`

---

### Test Coverage

New test files added (125 additional tests, 285 total):

| File | What it tests | Risk covered |
|------|--------------|-------------|
| `apps/web/src/app/api/optimize/route.test.ts` | `evaluateSubset` and `branchAndBound` | B&B regression — algorithm correctness |
| `apps/web/src/app/api/cards/bulk-lookup/route.test.ts` | `rowToResult` NUMERIC→float conversion | Silent NaN on price if DB contract changes |
| `apps/scraper/src/tools/validate-stores.test.ts` | Issue classification logic | Shopify failure mode classification |
| `apps/scraper/src/tools/suggest-improvements.test.ts` | Alias confidence tiers and `suggestAlias()` | eBay alias suggestion correctness |

The B&B optimizer was the highest-risk untested code in the codebase — pure computation with no external dependencies that should have been tested from day one. The `rowToResult` test documents and guards the implicit contract that postgres.js returns NUMERIC columns as strings.

**What is still not tested:**
- `apps/web/src/lib/db.ts` — integration tests, require a live database
- React components — snapshot tests are maintenance burden with near-zero regression value
- Playwright end-to-end — infrastructure not yet set up

---

### CSS Tokens

**`apps/web/tailwind.config.ts`** (new)

Tailwind 4 operates without this file at runtime. It exists solely for IDE autocomplete — VSCode Tailwind CSS IntelliSense and JetBrains can now suggest `bg-surface`, `text-cream`, `text-price`, etc. Token names in this file mirror `globals.css` exactly.

**`apps/web/src/app/globals.css`**

Added header comment documenting the three consumer paths (Tailwind utilities, chart inline styles, `tailwind.config.ts`). Updated stale hex fallback values in all chart components (`PriceChart.tsx`, `RarityBreakdown.tsx`, `CrashCurveChart.tsx`) to match the current dark mode palette.

---

## What Remains

These items are known gaps but were explicitly deferred from this refactor:

- **DB integration tests** — requires test database in CI; deferred to GitHub Actions CI phase
- **Live AUD/USD rate** — replaces static `AUD_USD_RATE` env var; deferred to Phase 2
- **eBay atomic swap** — staging table to eliminate zero-price window; deferred to Phase 2
- **MTG Mate set code cache** — weekly full rescan reduction from 30m to 3m; deferred to Phase 2
- **GitHub Actions CI** — typecheck + audit + test on PR; deferred to Phase 2
- **UNIQUE constraints** on `price_history` and `store_prices` — delete-then-insert pattern is sufficient guard for now

---

## Verification Checklist

- [x] `pnpm test` — 285 tests pass (was 160)
- [x] `pnpm tsc --noEmit` — clean across all packages
- [x] Zero `console.error` / `console.log` in web API routes
- [x] All 9 API routes rate-limited
- [x] Market movers CTE `sp_check` join removed from both gainers and losers CTEs
- [x] `TREND_UP_THRESHOLD` / `TREND_DOWN_THRESHOLD` defined in one place only
- [x] `fmtAUD()` defined in one place only
