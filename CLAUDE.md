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
| Deployment | Docker Compose on Proxmox LXC, public via Cloudflare tunnel |

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

### `packages/shared/src/types/card.ts`
Core data shapes mirroring the DB schema:
- **`Card`** — Abstract game object. "Lightning Bolt" is one Card regardless of how many sets it appears in. Keyed by Scryfall `oracle_id`.
- **`Printing`** — A specific physical version. "Lightning Bolt from M11, non-foil" is one Printing. Keyed by Scryfall card `id`.
- **`StorePrice`** — A price for a Printing at a specific Store, scraped at a point in time.
- **`PriceHistory`** — Daily snapshot of a price (append-only, one row per printing/store/day).
- **`Store`** — A retailer (MTG Mate, eBay AU, etc.).

### `packages/shared/src/types/scraper.ts`
The scraper contract:
- **`ScrapedCard`** — Raw data extracted from a store before it's matched to Scryfall. Has `rawName`, `setName` (may be null), `price`, `priceType` (sell/buylist), `condition`, `isFoil`, `inStock`, `sourceUrl`.
- **`StoreScraper`** — Interface all HTML store scrapers must implement. Requires `scrapeAll()` (async generator of ScrapedCard) and `healthCheck()`.
- **`MatchResult`** — Result of trying to match a ScrapedCard to a Printing. Has `matchType` (exact / name_only / fuzzy / unmatched) and `confidence` (0–1).

### `packages/shared/src/utils/matching.ts`
Pure functions for name matching:
- **`normalizeName(name)`** — Lowercases, strips accents, removes punctuation, collapses spaces.
- **`levenshteinDistance(a, b)`** — Edit distance for fuzzy matching.
- **`normalizeSetName(name)`** — Same idea for set names.
- **`SET_ALIASES`** — Map of store set name variants → Scryfall set codes.

### `packages/shared/src/utils/currency.ts`
AUD/USD conversion using a static rate from `AUD_USD_RATE` env var (defaults to 0.65).

---

## apps/scraper — The data collection service

Runs as a long-lived Docker service. Three cron jobs (all `Australia/Sydney` timezone):
- **3 AM daily** → Scryfall bulk import (refreshes all card/printing data)
- **5 AM daily** → Store scrapers (Shopify + MTG Mate)
- **6 AM daily** → eBay AU price import

Also runs an initial Scryfall import on startup if the DB is empty.

### `apps/scraper/src/lib/schema.ts`
Drizzle ORM schema — **source of truth for DB structure**.

Tables:
- **`cards`** — One row per unique MTG game object (oracle_id). ~32,330 rows.
- **`printings`** — One row per physical card version. ~141,656 rows. Has `card_id` FK, set code, foil flag, USD reference price, `released_at`.
- **`stores`** — Australian retailers + eBay AU, including `flat_shipping_aud`. Seeded from `STORE_REGISTRY` (`apps/scraper/src/stores/stores.config.ts`).
- **`store_prices`** — Current prices from stores/eBay. Overwritten each scrape run.
- **`price_history`** — Daily snapshots. Append-only.
- **`unmatched_cards`** — Scraped listings that couldn't be matched to a Scryfall printing.
- **`ebay_search_log`** — Tracks when each card name was last searched on eBay + result count. Drives tiered eBay scheduler.
- **`card_searches`** — Append-only log of user search queries. `card_id` FK populated from top search result. Powers demand-gap analytics (cards searched but not in stock anywhere).

### `apps/scraper/src/stores/shopify.ts` + `stores.config.ts`
Generic Shopify scraper — one class drives all Shopify-based stores via config. Shopify's `products.json` API is used directly (no HTML scraping). SKU-based matching significantly improves match rates. `goodgames.ts` was replaced by this.

`stores.config.ts` is the single source of truth for store registration — see [Adding a new Shopify store scraper](#adding-a-new-shopify-store-scraper) below. `shopifyStores()` derives the active Shopify store list (currently 32) from `STORE_REGISTRY`; `seedStores()` (`apps/scraper/src/seed.ts`) and the web app's shipping fallback (`apps/web/src/lib/store-shipping.ts`) derive from the same file, so a store exists in exactly one place.

### `apps/scraper/src/stores/crystalcommerce.ts`
Generic CrystalCommerce scraper — one class drives all stores on the CrystalCommerce
platform (Rails), config-driven the same way `shopify.ts` is. First store on it: The Games Cube.

CrystalCommerce has no products API, so this is HTML scraping via Cheerio. Every MTG singles
category is linked from the homepage nav mega-menu (~437 for The Games Cube), so category
discovery is a single request. Each category is then paged through with
`?filtered=1&filter_by_stock=in-stock`, which cuts a set from ~120 products over 4 pages to
~17 on one — a full run is ~700 requests rather than ~5000. On top of that, `ProbeCache`
(same pattern as MTG Mate) means daily runs only revisit categories that had stock, with a
full rescan every `CC_FULL_SCAN_DAYS` (default 7) to pick up restocks and new sets.
Cache file: `SCRAPER_CACHE_DIR/crystalcommerce-{storeId}-categories.json`.

Set name comes from the product's category, not the card. Finish/treatment come from `" - "`
title suffixes drawn from a fixed vocabulary (`- Foil`, `- Foil - Borderless`, `- Extended Art`);
only known suffixes are stripped, since real card names contain dashes too. Non-English variants
are skipped. The platform drops connections under load, so pages retry 3× with 2s/5s/10s backoff.

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

eBay import deletes all `store_prices` rows for `ebay_au` at start of each run, then repopulates. If interrupted, re-run to repopulate.

**eBay API quota notes:**
- ~5,000 calls/day on production app key. Resets midnight Pacific time.
- `REQUEST_DELAY_MS = 500` in `browse-client.ts`. On 429, retries 3x with 5s/15s/30s backoff.
- Current config: `EBAY_RECENT_MONTHS=3`, `EBAY_HIGH_VALUE_USD=50`

---

## apps/web — Next.js front-end

### Search page (`apps/web/src/app/page.tsx`)
- Full-text card search with infinite scroll (20 results/page)
- Scrymarket price: median of cheapest printing's in-stock sell prices
- Trend badge (↑/↓/→) vs `price_history`
- Card thumbnails (63×88px), color identity pips, CardMagnifier on hover
- Drag-to-search: drag any Scryfall card image onto the app
- Umami events: `card-search` on new query, `card-click` on row click

### Card detail page (`apps/web/src/app/cards/[id]/page.tsx`)
- Two-column layout: sticky card image + info/table/chart
- Market snapshot: Low / Scrymarket / High AUD, USD reference, trend badge
- Prices table: flat rows (printing × store), filter dropdowns, pagination
- Set symbols: Scryfall SVGs tinted by rarity, `❖` fallback for missing
- Row hover changes card image to that printing's art
- Price history chart: area chart (overall) + line chart by printing (max 8)

### Want List (`apps/web/src/app/want-list/WantListView.tsx`)
- Route: `/want-list`, context: `WantListContext.tsx`, badge: `WantListBadge.tsx`
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
| `EBAY_RECENT_MONTHS` | How far back to search by card name | `3` |
| `EBAY_HIGH_VALUE_USD` | USD threshold for card-name search pass | `50` |
| `EBAY_DAILY_TARGET` | Max eBay searches per daily run | `4500` |
| `USER_AGENT` | HTTP User-Agent for scraping | `Scrymarket/1.0` |
| `AUD_USD_RATE` | Static USD→AUD rate | `0.65` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token for `cloudflared` tunnel service | — |

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
- [x] Generic Shopify scraper — 21 AU stores, config-driven
- [x] Generic CrystalCommerce scraper — config-driven, The Games Cube
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
- [x] Vitest unit tests — 160 tests across card-matcher (all 6 match levels), normalizeName, Scryfall transform, eBay title parser, Shopify parser. Co-located `.test.ts` files, `pnpm test` from repo root (2026-04-02)
- [ ] Pin `:latest` image tags in docker-compose — `promtail`, `cloudflared`, `cadvisor`

### Phase 2 — Observability & Data Quality
*Visibility before growth.*

- [x] Deploy Prometheus + Grafana + Pushgateway on monitoring LXC (`vmbr2`) — live on vmbr2, scrapes cAdvisor at `10.10.20.10:8080`
- [x] `prom-client` gauges: `cards_scraped`, `match_rate`, `scrape_duration_seconds` — per-store match rate catches silent regressions
- [ ] MTG Mate set code cache — save valid codes to `data/mtgmate-valid-sets.json`, weekly full rescan (~30 min → ~3 min)
- [ ] Live AUD/USD rate (RBA or Open Exchange Rates API) — replace static `AUD_USD_RATE` env var
- [ ] eBay atomic swap — staging table → `TRUNCATE + INSERT` in transaction, eliminates zero-price window on interrupted runs
- [ ] Scryfall import streaming — replace `readFile` + `JSON.parse` (peaks at ~2GB heap) with a streaming JSON parser (e.g. `node-json-stream-parser`) so the 300MB bulk file is processed incrementally; workaround is `NODE_OPTIONS=--max-old-space-size=4096` in scraper env
- [ ] GitHub Actions CI — typecheck + `pnpm audit` + `pnpm test` on PR
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

**Why delete-then-insert for eBay prices?**
`store_prices` has no unique constraint on `(printing_id, store_id, price_type)`. We delete all `ebay_au` rows at the start of each run and bulk-insert fresh data. Safe because eBay prices are fully refreshed each run.

**Why Cloudflare tunnel instead of open ports?**
Zero inbound ports exposed. All public traffic goes Cloudflare edge → encrypted tunnel → Docker container. No firewall rules to manage, free TLS, DDoS protection included.

**Why Branch-and-Bound for the optimiser?**
The Want List optimiser solves an Uncapacitated Facility Location Problem: which subset of flat-rate stores minimises total cost (cards + postage)? 2^N enumeration works for small N but B&B prunes subtrees using an optimistic lower bound (open all undecided stores at $0 flat fee), making it fast in practice. Stores are sorted cheapest-flat-rate-first to produce tight upper bounds early.

**Why store `card_id` on `card_searches` from the top search result?**
The demand-gap report needs to join user searches against store inventory. At search time, the top result is the most likely intended card. Null is used when no results are returned. This is a best-effort attribution — accurate enough for aggregate demand analytics.

---

## Infrastructure — Proxmox

**Current setup**: Docker running inside an LXC on Proxmox.

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
