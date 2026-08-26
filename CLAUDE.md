# Scrymarket — Project Guide

## What this project does

Tracks Australian Dollar (AUD) prices for Magic: The Gathering singles.
It imports all card data from Scryfall (the authoritative MTG card database), scrapes Australian stores and eBay AU for current prices, and serves those prices through a Next.js web UI.

The goal: a self-hosted, self-sustaining price tracker for AU MTG players to compare what stores charge vs eBay market prices — with future B2B dashboards for stores to see demand analytics.

---

## Technology stack

| Layer | Tech |
|---|---|
| Language | TypeScript everywhere (strict mode) |
| Package manager | pnpm (monorepo with workspaces) |
| Database | PostgreSQL 16 via Docker |
| ORM | Drizzle ORM (type-safe SQL, no magic) |
| Scraper runtime | Node.js with `tsx` for dev, compiled JS for prod |
| HTML scraping | Cheerio (jQuery-style DOM parsing) |
| Scheduling | `node-cron` (pinned to `Australia/Sydney` timezone) |
| Web app | Next.js 15 (App Router) |
| Analytics | Umami (self-hosted, custom events) |
| Deployment | Images built+pushed to GHCR by GitHub Actions; server pulls via Docker Compose on Proxmox LXC, public via Cloudflare tunnel |

---

## Monorepo structure

```
mtg-au-tracker/
├── apps/
│   ├── scraper/          ← Data collection service
│   └── web/              ← Next.js front-end
├── packages/
│   └── shared/           ← TypeScript types and utilities used by both apps
├── docs/                 ← Ops and deployment docs
├── docker-compose.yml    ← Dev environment (scraper + web + postgres + tunnel)
├── docker-compose.prod.yml ← Production environment
├── .env.example          ← Copy to .env, fill in real values
└── package.json          ← Root workspace scripts
```

---

## packages/shared — Shared types and utilities

Everything here is pure TypeScript with no runtime dependencies. Both `apps/scraper` and `apps/web` import from `@mtg-au/shared`.

The DB row shapes are **not** here — `apps/scraper/src/lib/schema.ts` is the single source
of truth for those, and the web app types its queries at the call site. Shared holds only
what both apps genuinely need.

### `packages/shared/src/types/scraper.ts`
The scraper contract:
- **`ScrapedCard`** — Raw data extracted from a store before it's matched to Scryfall. Has `rawName`, `setCode`/`setName`/`collectorNumber` (each may be null), `price`, `priceType` (sell/buylist), `condition`, `isFoil`, optional `finish` and `treatment`, `inStock`, `sourceUrl`, optional `shippingCost`.
- **`StoreScraper`** — Interface all store scrapers implement. One method: `scrapeAll()`, an async generator of `ScrapedCard`.

`MatchResult` is **not** here — it lives in `apps/scraper/src/matching/card-matcher.ts`,
since only the scraper matches.

### `packages/shared/src/utils/matching.ts`
Pure functions for name matching:
- **`normalizeName(name)`** — Lowercases, strips accents, removes punctuation, collapses spaces.
- **`stripVariant(name)`** — Removes variant/treatment suffixes from a card name.
- **`levenshteinDistance(a, b)`** — Edit distance for fuzzy matching.
- **`normalizeSetName(name)`** — Same idea for set names.
- **`extractTreatment(text)`** — Canonical treatment (`borderless` / `showcase` / `extendedart` / `fullart`) from a title or tag.

### `packages/shared/src/utils/condition.ts`
`CARD_CONDITIONS` + `CardCondition`, `isKnownCondition()`, and `normaliseCondition()` —
maps the many store spellings of NM/LP/MP/HP/DMG onto one vocabulary.

### `packages/shared/src/utils/currency.ts`
`getAudPerUsd()` fetches the **live** USD→AUD rate from the Frankfurter API (free, no key,
ECB-sourced), falling back to the `AUD_USD_RATE` env var (default 0.65) if the fetch fails.
It takes an optional `RequestInit` so callers can add framework caching; the web app wraps
it in `apps/web/src/lib/exchange-rate.ts` with `next: { revalidate }` for hourly caching.
`AUD_USD_RATE` is absent from `.env.example` deliberately — it is only the failure fallback.

### `packages/shared/src/constants.ts`
`TREND_UP_THRESHOLD` / `TREND_DOWN_THRESHOLD` — the ±1% band shared by the scraper's trend
computation and the web `TrendBadge`, so both agree on what counts as a move.

### `packages/shared/src/utils/logger.ts`
`createLogger(service)` — pino, pretty-printed in dev via a `pino-pretty` transport, plain
NDJSON to stdout in production for Promtail → Loki.

---

## apps/scraper — The data collection service

Runs as a long-lived Docker service. Stores are scraped `STORE_CONCURRENCY` at a time
(`runAllStores()`), so one slow store doesn't hold up the rest. Three cron jobs (all
`Australia/Sydney` timezone):
- **3 AM daily** → Scryfall bulk import (refreshes all card/printing data)
- **5 AM daily** → Store scrapers (Shopify + MTG Mate)
- **6 AM daily** → eBay AU price import
- **7 AM daily** → Market stats — **currently paused**, see below

Also runs an initial Scryfall import on startup if the DB is empty.

**Market stats are paused — except `set_card_daily`.** `computeMarketStats()` returns
immediately unless `MARKET_STATS_ENABLED=true`. `refreshSetCardDaily()` is deliberately
**outside** that gate and runs every night from the 7 AM cron, because the card detail
price chart reads the table it maintains; leaving it gated is why `set_card_daily` sat
empty in production while the docs described it as the fast path. It is also the only
pass written incrementally, so it is not what saturated the disks.

The one pass still behind the flag is `computeScrymarketPrices()`. It reads the whole of
`price_history` and saturates the production disks for hours — one run was measured still
going 5h42m in, with every other query on the box stalled behind it. While paused,
`cards.scrymarket_price` and `cards.price_trend` go stale, which means the search page
price and both trend badges freeze. Re-enabling needs it reworked to be incremental first;
`refreshSetCardDaily()` is already written that way, it is not.

The two other passes that used to live here — `computeMarketMovers()` and
`updateSetValues()` — were deleted with the /sets pages that were their only readers. Their
`market_movers` table and `sets.set_value_aud` column still exist but have no writer; both
are marked ORPHANED in `schema.ts` and are slated for a drop migration.

The flag gates the function rather than the cron registration, because the eBay
import calls it too (`ebay-import.ts`). Running the script by hand
(`pnpm --filter @mtg-au/scraper exec tsx src/market/compute-market-stats.ts`) still
executes regardless — that's a deliberate human decision to pay the IO cost.

### `apps/scraper/src/lib/schema.ts`
Drizzle ORM schema — **source of truth for DB structure**.

Tables:
- **`cards`** — One row per unique MTG game object (oracle_id). ~32,330 rows.
- **`printings`** — One row per physical card version. ~141,656 rows. Has `card_id` FK, set code, foil flag, USD reference price, `released_at`.
- **`stores`** — Australian retailers + eBay AU, including `flat_shipping_aud`. Seeded from `STORE_REGISTRY` (`apps/scraper/src/stores/stores.config.ts`).
- **`store_prices`** — Current prices from stores/eBay. Overwritten each scrape run.
- **`price_history`** — Daily snapshots. Append-only.
- **`unmatched_cards`** — Scraped listings that couldn't be matched to a Scryfall printing. **Current run only** — every writer clears its own rows before inserting (`run-all.ts` per store, `ebay-import.ts` for `ebay_au`). An unmatched listing names no printing, so nothing in the UI can reach it; it's only useful for debugging the run that produced it. The eBay path used to append without ever deleting, which is how the table reached 14.4M rows / 3.4GB.
- **`ebay_search_log`** — Tracks when each card name was last searched on eBay + result count. Drives tiered eBay scheduler.
- **`scraper_cache`** — Probe-cache state for the discover-then-probe scrapers (MTG Mate set codes, CrystalCommerce category slugs). One row per cache key holding the hits from the last full scan. Lives here rather than in JSON files on the scraper's disk: it was the only local state the container had, and losing it forces a full CrystalCommerce sweep (1.5–4h).
- **`card_searches`** — Append-only log of user search queries. `card_id` FK populated from top search result. Powers demand-gap analytics (cards searched but not in stock anywhere).
- **`set_card_daily`** — Pre-aggregated cheapest non-foil sell price per (set, card, day), built nightly from `price_history` by `refreshSetCardDaily()`. Backs the card detail price chart — see [The card price chart reads pre-aggregated data](#the-card-price-chart-reads-pre-aggregated-data). Exists because `price_history` carries no `set_code`, so answering "cheapest per card per day, per set" live meant scanning all ~18GB of it per request. Foils and basic lands are filtered at build time. Pruned to `SET_CARD_DAILY_RETENTION_DAYS` (default 365) on each refresh; without that it grows ~29k rows/day forever.
- **`market_movers`** — **Orphaned.** Fed the /sets top-movers leaderboard; that page and its writer are gone. Slated for a drop migration.

### `apps/scraper/src/stores/shopify.ts` + `stores.config.ts`
Generic Shopify scraper — one class drives all Shopify-based stores via config. Reads the
**Storefront GraphQL API** (`/api/2025-01/graphql.json`), which every store exposes
unauthenticated — no token or per-store credential. SKU-based matching significantly improves
match rates. `goodgames.ts` was replaced by this.

**`products.json` is gone and must not come back.** Shopify caps pagination of any array at
25,000 objects and enforces it on the *offset*: `limit × page` may not exceed 25,000, so
`limit=250&page=101` is HTTP 400 and no page size or parallelism reaches product 25,001. 13 of
33 stores are over that line (the largest holds 151,141 products). Until commit `10ca01a` the
400 was swallowed into "no more products" and those stores silently published a truncated
catalogue — Cardhouse held 22,355 printings of a 133,202-product store.

`scrapeAll()` picks the most precise source the catalogue size allows, each fallback triggered
by Shopify's own pagination-limit error rather than a configured threshold:

1. **The collection** — names exactly the products we want, keeps out-of-stock listings. Works
   until the collection passes 25,000 items.
2. **Top-level `products(query:)`**, filtered to `available_for_sale:true` + the store's
   `productType` (auto-detected from the collection, since the value varies: "MTG Single",
   "Single Cards", "TCG Singles").
3. **Keyset windows by `created_at`** when even that overflows. The query sorts by creation
   date, so the last product seen is the watermark the next window resumes from.

A large store therefore ends up with the union of the partial collection walk and every in-stock
product beyond it. Measured: Cardhouse 41,210 printings (was 22,355), Plenty of Games 50,223
(was 23,681), The Games District 35,035 products where `products.json` failed outright.

**Traps, all verified against live stores:**
- `collection.products(filters:[{available:true}])` applies the filter only *within* the first
  25,000 items — it returns a subset while looking like it succeeded (3,009 of 18,432 on The
  Games District). Never use it; the unfiltered collection at least fails loudly.
- Search fields `price:`, `vendor:`, `sku:` and `updated_at:` are **accepted and silently
  ignored** — `price:>=1000000` returns the entire catalogue. Only `created_at:`, `tag:`,
  `title:` and `product_type:` actually filter. Check a filter changes the result set, not just
  that it doesn't error.
- Filtering by `product_type` alone is not enough for small stores: Gameology's type is a
  generic "Single Cards" that includes Pokémon, which drops its match rate to 45.7%. That is
  why the collection is tried first.
- `quantityAvailable` needs an inventory scope we don't have; `inventory_quantity` is set to 0
  and `isInStock()` reads `availableForSale` instead.

`stores.config.ts` is the single source of truth for store registration — see [Adding a new Shopify store scraper](#adding-a-new-shopify-store-scraper) below. `shopifyStores()` derives the active Shopify store list (currently 35) from `STORE_REGISTRY`; `seedStores()` (`apps/scraper/src/seed.ts`) and the web app's shipping fallback (`apps/web/src/lib/store-shipping.ts`) derive from the same file, so a store exists in exactly one place.

### `apps/scraper/src/stores/crystalcommerce.ts`
Generic CrystalCommerce scraper — one class drives all stores on the CrystalCommerce
platform (Rails), config-driven the same way `shopify.ts` is. First store on it: The Games Cube —
built and verified, but currently `scraperEnabled: false` pending the store's permission, so no
CrystalCommerce store is scraped in practice today.

CrystalCommerce has no products API, so this is HTML scraping via Cheerio. Every MTG singles
category is linked from the homepage nav mega-menu (~437 for The Games Cube), so category
discovery is a single request. Each category is then paged through with
`?filtered=1&filter_by_stock=in-stock` — out-of-stock listings have no price worth keeping and
dropping them roughly halves the pages. `ProbeCache` (same pattern as MTG Mate) then means daily
runs only revisit categories that had stock, with a full rescan every `CC_FULL_SCAN_DAYS`
(default 7) to pick up restocks and new sets.
Cache row: `scraper_cache."crystalcommerce-{storeId}-categories"`.

**It's a big job, and there is no bulk shortcut.** 30 products/page is a hard cap (`per_page`
and `limit` are ignored) and The Games Cube stocks ~93k listings, so a full sweep is ~3,500
pages at ~2.3s of server TTFB each. Ruled out: `.json`/`.xml` on catalog routes → 415,
`/products.json` and Google-feed paths → 404, `Accept: application/json` → 500, and
`/products/multi_search` returns out-of-stock printings with no in-stock filter (3MB for 5 card
names — heavier than browsing). Unlike MTG Mate there is no "one request per set" endpoint, so
the only lever is parallelism via `CC_CONCURRENCY`.

Measured full run at concurrency 3: **88 min**, 3,483 pages, 93,223 listings, 90.2% match rate,
zero fetch failures. Like-for-like against the same checkpoint, that's **1.65x** faster than
sequential — well short of 3x, because the store's per-request latency roughly doubles under
parallel load (it is Passenger-worker-bound, not bandwidth-bound).

**Runtime is not stable — expect 1.5–4h.** A second run the same night took **4h14m**: the first
351 categories finished in 67 min at ~1.3s/page, then the last 44 took 187 min at ~33s/page. The
store starts stalling connections under sustained scraping, and because those pages time out and
then *succeed* on retry, nothing is logged as an error. Watch `secs_per_page` and `retries` in
the progress log — that's what makes the degradation visible. If it's climbing, the store is
telling us to back off: lower `CC_CONCURRENCY`, don't retry harder.

**Don't raise `CC_CONCURRENCY` above 3 without re-measuring.** 4-wide benchmarked faster in
isolation but returned a 503 — the store sheds load. Given latency scales with concurrency,
expect diminishing returns rather than a linear win. If 503s appear at 3, drop to 2.

Set name comes from the product's category, not the card. Finish/treatment come from `" - "`
title suffixes drawn from a fixed vocabulary (`- Foil`, `- Foil - Borderless`, `- Extended Art`);
only known suffixes are stripped, since real card names contain dashes too. Non-English variants
are skipped, as are variant rows whose first field isn't a real condition (the aggregate
"All variants" row). The platform drops connections under load, so pages retry 3× with
2s/5s/10s backoff, on top of `BaseScraper`'s own retry of transient HTTP statuses.

Category discovery keeps **leaf categories only**. The mega-menu also links its grouping levels
(`magic_singles-standard` next to `magic_singles-standard-bloomburrow`), and an intermediate node
lists every product under all its children — scraping one blows through `maxPagesPerCategory` and
duplicates every leaf's listings. Any slug that is a strict `-`-boundary prefix of another is
dropped. Hitting the page cap now logs a warning rather than truncating silently.

Categories are streamed through a `CC_CONCURRENCY`-wide pool (`mapConcurrentStream`), not fixed
chunks, so a 25-page category doesn't stall the 1-page ones beside it. The cache keeps categories
that had stock **plus any whose pages exhausted their retries** — a failed category isn't known to
be empty, and pruning it would drop a whole set from prices until the next full scan.

Add a CrystalCommerce store with a `crystalCommerce: { categoryPrefix, maxPagesPerCategory }`
block in `STORE_REGISTRY` — no scraper code changes.

### `apps/scraper/src/stores/mtgmate.ts`
MTG Mate HTML scraper.

### `apps/scraper/src/scryfall/bulk-import.ts`
Downloads Scryfall's "default_cards" bulk data (~300MB JSON), transforms all cards, batch-upserts into `cards` and `printings`. Safe to rerun.

### `apps/scraper/src/matching/card-matcher.ts`
Matches scraped card names to Scryfall printings via in-memory index:
1. **Level 0** — collector number match. Confidence: 1.0.
2. **Exact match** — normalised name + resolved set code. Confidence: 1.0.
3. **Name-only match** — normalised name, ignores set. Confidence: 0.8.
4. **Fuzzy match** — Levenshtein distance ≤ 2. Confidence: 0.6–0.8.
5. **Unmatched** — Saved to `unmatched_cards` for review.

Also maintains `setNameIndex` built from DB — resolves store set names ("FINAL FANTASY") to Scryfall set codes ("fin") automatically.

### `apps/scraper/src/ebay/`
Full eBay AU import pipeline:
- `oauth.ts` — Client Credentials token
- `browse-client.ts` — Browse API search with rate limiting (500ms) + retry (3x with 5s/15s/30s backoff)
- `transform.ts` — Parses messy eBay titles into `ScrapedCard` objects
- `ebay-import.ts` — Orchestrates: search → parse → match → upsert. Quota-filling approach: always searches `EBAY_DAILY_TARGET` (default 4500) stalest cards per run.

eBay prices are replaced **per card, inside a transaction** — `atomicSwapCardPrices()` deletes
that card's `ebay_au` rows and inserts the fresh ones in one statement pair, so readers never
see a zero-price window. An interrupted run therefore leaves already-processed cards fresh and
the rest merely stale; re-run to finish the remainder. (This used to be a delete-everything-then-
repopulate run, which is where the "re-run to repopulate" advice came from.)

**eBay API quota notes:**
- ~5,000 calls/day on production app key. Resets midnight Pacific time.
- `REQUEST_DELAY_MS = 500` in `browse-client.ts`. On 429, retries 3x with 5s/15s/30s backoff.
- `EBAY_DAILY_TARGET` (default 4500) is the per-run search budget, deliberately under the cap.

---

## apps/web — Next.js front-end

### Search page (`apps/web/src/app/page.tsx`)
- Full-text card search with infinite scroll (20 results/page)
- Scrymarket price: median of cheapest printing's in-stock sell prices
- Trend badge (↑/↓/→) from the pre-computed `cards.price_trend`
- Card thumbnails (63×88px), color identity pips, CardMagnifier on hover
- Drag-to-search: drag any Scryfall card image onto the app
- Umami events: `card-search` on new query, `card-click` on row click

### Card detail page (`apps/web/src/app/cards/[slug]/page.tsx`)
- Two-column layout: sticky card image + info/table/chart
- Market snapshot: Low / Scrymarket / High AUD, USD reference, trend badge
- Prices table: flat rows (printing × store), filter dropdowns, pagination
- Set symbols: Scryfall SVGs tinted by rarity, `❖` fallback for missing
- Row hover changes card image to that printing's art
- Price history chart: area chart (overall) + line chart **per set** (not per printing — that is the grain `set_card_daily` holds). Streamed behind `<Suspense>` via `PriceChartSection.tsx`

### Want List (`apps/web/src/app/want-list/WantListView.tsx`)
- Route: `/want-list`, context: `src/app/WantListContext.tsx`, badge: `src/app/WantListBadge.tsx`
- localStorage keys: `scrymarket_buy_list` (items), `scrymarket_shipping_overrides` (per-store postage)
- Per-store collapsible sections with store total shown in header when collapsed
- Printing selector shows all in-stock printings across ALL stores, sorted cheapest first
- Flat-rate stores: postage shown once in store footer, click-to-edit inline
- eBay: per-item postage column + subtotal in footer
- Item ID: `${printingId}-${storeId}-${url ?? ""}` — unique per distinct listing
- **Optimise feature** (`/api/optimize`): Branch-and-bound over flat-rate store subsets. Flat fees added once per store. Tie-breaking prefers lower flat-rate stores for equal card prices. Per-store shipping overrides sent in POST body and applied server-side. Review modal: lock cards to current printing, re-optimise, apply selected changes.

### `apps/web/src/app/BuyLink.tsx`
Single component for all outbound store buy links. Owns:
- Umami `store-click` event tracking (passes `storeId`, `card`, `price`, `source`)
- `applyAffiliateParams()` — extend per store when affiliate deals are set up, no call-sites change
- Correct `rel="noopener noreferrer"` and new-tab behaviour

### `apps/web/src/lib/store-shipping.ts`
`getStoreShippingRates()` — flat-rate postage per store (AUD), keyed by `store_id`, read from `stores.flat_shipping_aud` (seeded from `STORE_REGISTRY` in `stores.config.ts`) and cached in memory for an hour. Fallback when a store_prices row doesn't supply `shipping_aud`. eBay is `null` (per-item shipping).

---

## Database setup

### First-time setup
```bash
cp .env.example .env
# Edit .env with real values

docker compose up db -d
docker compose run --rm scraper pnpm --filter @mtg-au/scraper db:migrate
docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed
docker compose up -d
# Scryfall import runs automatically on first boot (~10-15 min)
```

### Useful DB commands
```bash
# All run via docker compose:
docker compose run --rm scraper pnpm --filter @mtg-au/scraper db:generate   # after schema changes
docker compose run --rm scraper pnpm --filter @mtg-au/scraper db:migrate    # apply pending migrations
```

---

## Environment variables

See `.env.example` for all variables. Key ones:

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://mtg:changeme@localhost:5432/mtg_tracker` |
| `SCRYFALL_BULK_URL` | Scryfall bulk data API endpoint | `https://api.scryfall.com/bulk-data` |
| `SCRAPE_CRON_SCRYFALL` | Cron for Scryfall import | `0 3 * * *` |
| `SCRAPE_CRON_STORES` | Cron for store scrapers | `0 5 * * *` |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | eBay API credentials | — |
| `EBAY_DAILY_TARGET` | Max eBay searches per daily run | `4500` |
| `MARKET_STATS_ENABLED` | Set to `true` to un-pause the nightly market stats job (does **not** gate `set_card_daily`) | unset (paused) |
| `SET_CARD_DAILY_RETENTION_DAYS` | Days of `set_card_daily` to keep before pruning | `365` |
| `STORE_CONCURRENCY` | Stores scraped in parallel by `runAllStores()` | `3` |
| `CC_CONCURRENCY` | CrystalCommerce categories in flight (do not exceed 3) | `3` |
| `CC_FULL_SCAN_DAYS` | Days between full CrystalCommerce category rescans | `7` |
| `USER_AGENT` | HTTP User-Agent for scraping | `Scrymarket/1.0` |
| `SCRYFALL_OUTPUT_DIR` | Where the Scryfall bulk file downloads to | `/tmp/mtg-scraper` |
| `MTGMATE_FULL_SCAN_DAYS` | Days between full MTG Mate set-code rescans | `7` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token for `cloudflared` tunnel service | — |
| `IMAGE_REGISTRY` | Registry+namespace for prod images (ECR-swap lever) | `ghcr.io/luperr` |
| `IMAGE_TAG` | Which prod image to run; `main-<sha>` to pin/rollback | `latest` |

---

## Deployment

Images are **built and pushed to GHCR by GitHub Actions** (`.github/workflows/deploy-images.yml`)
on every merge to `main` — the server never builds. Deploying is a pull:

```bash
# On the server (repo checkout at /opt/mtg-au-tracker):
./scripts/deploy.sh                 # deploy :latest
./scripts/deploy.sh main-abc1234    # pin/rollback to a specific image tag
```

`deploy.sh` runs `git pull` (refreshes the compose file and the script itself — migrations
are baked into the image, not read from the checkout) → `docker compose pull` → `db:migrate`
(before restart) → `up -d`. The old web serves against the new schema during that window, so
migrations must be backward-compatible with the running release.

`docker-compose.prod.yml` references images via
`${IMAGE_REGISTRY:-ghcr.io/luperr}/scrymarket-{web,scraper}:${IMAGE_TAG:-latest}`, with
`pull_policy: always` so a failed pull fails the deploy instead of silently building on the
server; the `build:` blocks remain only as an emergency fallback. This is deliberately AWS-ready: the
image is the deploy artifact, migrations are a discrete command, and `IMAGE_REGISTRY` makes
GHCR→ECR a config swap. Full runbook: `docs/prod-release.md`.

---

## Adding a new Shopify store scraper

Any AU MTG store running Shopify can be added with a config change only — no new scraper code.

1. **`apps/scraper/src/stores/stores.config.ts`** — add one entry to `STORE_REGISTRY`:
   ```ts
   {
     id: "store_id", name: "Store Name", baseUrl: "https://store.com.au", scraperEnabled: true, logoUrl: null,
     flatShippingAud: 6.50, // null if postage varies per item
     shopify: { collectionHandle: "magic-the-gathering-singles" },
   }
   ```
   This one entry drives the scraper (via `shopifyStores()`), the DB seed, and the web app's shipping fallback — no other files to edit.
2. Seed the DB: `docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed`
3. Test: `docker compose run --rm scraper pnpm --filter @mtg-au/scraper scrape:stores`

To find the collection handle, browse to `/collections.json` on the store's domain and look for the MTG singles collection slug.

## Adding a new CrystalCommerce store scraper

Same deal for stores on CrystalCommerce (Rails — check for `crystalcommerce` in the page source,
or a `_secure_frontend_session_id` cookie). Add one `STORE_REGISTRY` entry:

```ts
{
  id: "store_id", name: "Store Name", baseUrl: "https://store.com.au", scraperEnabled: true, logoUrl: null,
  flatShippingAud: 6.50,
  crystalCommerce: { categoryPrefix: "magic_singles", maxPagesPerCategory: 25 },
}
```

`categoryPrefix` is the category-slug prefix for MTG singles — find it by looking at any singles
product URL (`/catalog/magic_singles-standard-bloomburrow/card_name/693640` → `magic_singles`).

---

## What's been built

- [x] pnpm monorepo with scraper, web, and shared packages
- [x] Docker Compose dev + prod environments
- [x] PostgreSQL schema via Drizzle ORM
- [x] Scryfall bulk import (~32k cards, ~141k printings)
- [x] Card matcher with exact / name-only / fuzzy / collector-number matching
- [x] eBay AU import pipeline (OAuth → Browse API → title parser → DB)
- [x] Generic Shopify scraper — 35 AU stores, config-driven
- [x] Generic CrystalCommerce scraper — config-driven, The Games Cube (built and verified; disabled pending store permission)
- [x] MTG Mate HTML scraper
- [x] Next.js web UI — search, card detail, price history charts
- [x] Want List with per-store postage editing and Branch-and-Bound optimiser
- [x] BuyLink component — centralised tracking, affiliate-ready
- [x] Umami analytics — card-search, card-click, store-click events
- [x] `card_searches` table — demand analytics foundation (search query + top card ID)
- [x] Cloudflare tunnel for public access (no open ports)
- [x] Security headers (CSP, X-Frame-Options, etc.) via Next.js config
- [x] Cron jobs pinned to Australia/Sydney timezone

## Roadmap

Phases are gated — nothing from Phase N+1 starts until Phase N exit criteria are met.

### Phase 1 — Stability & Foundations
*Must be done before any new features ship.*

- [x] Fix DFC bug — Shopify scraper now ingests DFC cards (removed `//` rejection); front-face fallback index in card-matcher; `image_uri_back` stored in `printings`; flip button on card detail page (2026-03-31)
- [x] `price_history` table partitioning by month — monthly RANGE partitions 2025–2028 + DEFAULT catch-all. Add new year's partitions before 2029.
- [x] Wire `pino` structured logging to scraper and web — structured JSON to stdout, Promtail ships to Loki with `service`, `component`, `level`, `store` labels
- [x] Add DB indexes on FK columns (`printing_id`, `store_id`) on `store_prices` and `price_history`
- [ ] Add UNIQUE constraints to `price_history` and `store_prices` — deferred; delete-then-insert pattern is sufficient guard for now
- [x] Vitest unit tests — 405 tests across card-matcher (all 6 match levels), normalizeName, Scryfall transform, eBay title parser, Shopify parser. Co-located `.test.ts` files, `pnpm test` from repo root (2026-04-02)
- [ ] Pin `:latest` image tags in docker-compose — `promtail`, `cloudflared`, `cadvisor`

### Phase 2 — Observability & Data Quality
*Visibility before growth.*

- [x] Deploy Prometheus + Grafana + Pushgateway on monitoring LXC (`vmbr2`) — live on vmbr2, scrapes cAdvisor at `10.10.20.10:8080`
- [ ] `prom-client` gauges: `cards_scraped`, `match_rate`, `scrape_duration_seconds` — per-store match rate would catch silent regressions. **Not started** — there is no `prom-client` dependency in the repo; this was ticked in error.
- [x] MTG Mate set code cache — valid codes live in `scraper_cache`, full rescan every `MTGMATE_FULL_SCAN_DAYS` (~30 min → ~3 min)
- [x] Live AUD/USD rate — `getAudPerUsd()` reads the Frankfurter API (ECB, free, no key); `AUD_USD_RATE` is now only the fetch-failure fallback
- [x] eBay atomic swap — done differently and better than planned: `atomicSwapCardPrices()` does a per-card DELETE+INSERT inside `db.transaction()`, so there is no zero-price window and no staging table
- [x] Scryfall import streaming — reads Scryfall's `jsonl_download_uri`, gunzips through `pipeline()` to disk, then parses one line at a time via `createInterface`. No whole-file parse
- [ ] Scryfall import — batch the upserts. Parsing streams, but `importData()` still accumulates every card and printing in memory before writing, which is what actually sets the heap floor now
- [x] GitHub Actions CI — `.github/workflows/ci.yml` runs typecheck (both workspaces), `pnpm test`, and a Docker build of each image on every PR. `pnpm audit` is still not wired in
- [ ] Proxmox network hardening — move Docker LXC to vmbr1 (Services VLAN), SSH hardening + fail2ban, 2FA

### Phase 3 — Analytics & User Features
*Monetisation & engagement.*

- [ ] Demand-gap dashboard — cards searched but not in stock anywhere (`card_searches` + `store_prices`)
- [ ] B2B store dashboards — nightly ETL of Umami events into PG, Next.js dashboard behind auth
- [ ] Auth layer — NextAuth + GitHub/Google (required for B2B dashboards)
- [ ] Price alerts — email/push on threshold drop
- [ ] Rate limiting on all API routes — `@upstash/ratelimit` or Cloudflare rule
- [ ] Branding polish — favicon, OG images, CSP `unsafe-inline` cleanup (see Branding section below)

### Phase 4 — Scale
*Only when Proxmox constrains you.*

- [ ] AWS ECS + RDS deployment
- [ ] Replace `node-cron` with BullMQ — retry, concurrency, per-job visibility
- [ ] Public API for AU MTG prices — rate-limited, community goodwill + discovery
- [ ] Additional AU stores — Hareruya AU, Nerd Cave, etc. (pure config if Shopify)
- [ ] Per-card OG images — card art + price snapshot for social sharing / SEO

### Deliberately out of scope
Deck builder integration, international price comparison, MTG Arena/MTGO pricing, social features, mobile app, ML price prediction. None of these strengthen the core value prop before it's fully locked in.

---

## Key design decisions

**Why separate Card and Printing tables?**
"Lightning Bolt" has been printed in 20+ sets. We store it once as a Card, then once per physical version as a Printing. Store prices attach to Printings because prices differ between sets.

**Why Drizzle over Prisma?**
Drizzle produces plain SQL, is fast, and keeps the schema in TypeScript with no code generation step at runtime.

**Why async generators for scrapers?**
`scrapeAll()` returns `AsyncGenerator<ScrapedCard>` so the orchestrator processes results incrementally rather than waiting for a full scrape to finish.

**Why per-card delete-then-insert for eBay prices?**
`store_prices` has no unique constraint on `(printing_id, store_id, price_type)`, so a refresh is
a delete followed by an insert. Doing that for the whole store at once opens a window where eBay
has no prices at all, and an interrupted run leaves it that way until tomorrow. Scoping the pair
to one card and wrapping it in a transaction removes the window entirely, at the cost of many
small transactions instead of one big one — a trade worth making when the run takes hours and can
be interrupted.

**Why Cloudflare tunnel instead of open ports?**
Zero inbound ports exposed. All public traffic goes Cloudflare edge → encrypted tunnel → Docker container. No firewall rules to manage, free TLS, DDoS protection included.

**Why Branch-and-Bound for the optimiser?**
The Want List optimiser solves an Uncapacitated Facility Location Problem: which subset of flat-rate stores minimises total cost (cards + postage)? 2^N enumeration works for small N but B&B prunes subtrees using an optimistic lower bound (open all undecided stores at $0 flat fee), making it fast in practice. Stores are sorted cheapest-flat-rate-first to produce tight upper bounds early.

**Why store `card_id` on `card_searches` from the top search result?**
The demand-gap report needs to join user searches against store inventory. At search time, the top result is the most likely intended card. Null is used when no results are returned. This is a best-effort attribution — accurate enough for aggregate demand analytics.

### The card price chart reads pre-aggregated data

The now-deleted `/sets/[setCode]` pages used to aggregate `price_history` live on every
request. Because `price_history` has no `set_code`, filtering to one set meant scanning all
seven monthly partitions — ~18GB. The database lives on a ZFS mirror of USB-attached
spinning disks (~40 IOPS; moving it to the NVMe isn't possible on this hardware), so each
of those took minutes, and requests arrived faster than they drained: a dozen backends
piling up on the same scan drove host-wide IO pressure to 96% and load to 25.

The fix was to compute the aggregate once a night into `set_card_daily` and read that
instead. The set pages are gone, but **the card detail price chart inherited the same
table**, and that is now the sole reason `set_card_daily` and its nightly refresh exist —
do not assume they went away with /sets.

Consequences worth remembering:
- **`price_history` is still the source of truth.** `set_card_daily` is a derived cache and
  can be rebuilt by truncating it — `refreshSetCardDaily()` backfills every missing date
  (`pnpm --filter @mtg-au/scraper refresh:set-card-daily`), bounded by
  `SET_CARD_DAILY_RETENTION_DAYS`. Budget hours for a rebuild from empty: on prod that is
  ~162 dates of ~764k rows each. It resumes from `MAX(recorded_at)` if interrupted.
- **It backfills one `recorded_at` per statement, on purpose.** Each is pruned to a single
  partition and driven by `price_history_recorded_at_idx`. A single whole-table statement
  would be the multi-hour scan this change exists to avoid.
- **The newest existing date is always recomputed**, since the nightly task can run while a
  store scrape is still writing that day's rows.
- **The card detail chart is the only reader.** Its query used to read `price_history`
  directly with no date bound at all: 49 partitions probed (43 of them empty, pre-created
  through 2028), **126,262 physical reads and 109s** for a 100-printing card on a cold
  cache. Against `set_card_daily` the same chart costs **732 buffers, 1.8ms**. The series
  are per-set rather than per-printing because that is the grain this table holds, and
  foils are excluded for the same reason.
- **The chart is also streamed rather than awaited.** `page.tsx` renders from `printings` +
  `store_prices` (3ms warm) and the chart arrives behind a `<Suspense>` boundary
  (`PriceChartSection.tsx`), so a slow history query can never again hold the whole page.
- **Anything new that needs per-set history should extend this table, not re-query
  `price_history`.** There are no live `price_history` scans left in the web app — the last
  one, `getSymbioticMovers()`, went with the /sets removal. Keep it that way.

---

## Infrastructure — Proxmox

**Current setup**: Docker running inside an LXC on Proxmox.

**Postgres is tuned for a disk that can't seek.** The database lives on `lpool` — a ZFS
mirror of two USB-attached spinning drives (~40 IOPS), and moving it to the idle NVMe
isn't possible on this hardware. Every Postgres setting in `docker-compose.prod.yml` is
there to keep pages in RAM rather than to spend CPU. Until 2026-08-17 it ran on stock
defaults: `shared_buffers=128MB` against a ~20GB database, a **40% cache hit rate**
(healthy is 95–99%), and 5.9GB of the container's 7.6GB unused.

`random_page_cost` (4) and `effective_io_concurrency` (1) are deliberately left alone —
both are honest values for a single spinning mirror, and lowering either pushes the
planner toward more random IO, which is exactly the resource in short supply.

**When a query is slow here, suspect physical reads before suspecting the plan.** The
card detail page was taking 228s on a *correctly indexed* query — `printings_card_id_idx`
existed and was being used. It was slow purely because tens of thousands of scattered
blocks each cost a seek. Check `pg_statio_user_tables` cache hit rate before rewriting SQL.

**Planned network architecture**:
- `vmbr0` VLAN 10 (Management): Proxmox UI (8006), SSH — LAN only
- `vmbr1` VLAN 20 (Services): Docker LXC — internet via Cloudflare tunnel only
- `vmbr2` VLAN 30 (Monitoring): future Prometheus/Grafana/Pushgateway LXC

**Pending infra tasks**:
- [ ] SSH hardening + fail2ban on Proxmox host
- [ ] Create vmbr1, move Docker LXC off management VLAN
- [ ] Enable Proxmox 2FA
- [ ] Add monitoring LXC (vmbr2) with Prometheus + Grafana + Pushgateway

---

## Branding — post-alpha nice-to-haves

- **Favicon** — currently an emoji (🃏). Replace with proper SVG/PNG
- **OG image** — functional placeholder; polish with card art + logo lockup
- **Logo / wordmark** — SCRYMARKET uses Bitcount Prop Double font; consider proper SVG asset
- **Colour palette** — CSS vars (--cream, --accent, --price, --cta etc) not yet formally documented
- **CSP `unsafe-inline` cleanup** — move inline theme init script to `/public/theme-init.js`
- **Per-card OG images** — card detail pages with card art + price snapshot
