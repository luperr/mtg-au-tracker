# Scrymarket — Project Guide

## What this project does

Tracks Australian Dollar (AUD) prices for Magic: The Gathering singles.
It imports all card data from Scryfall (the authoritative MTG card database), scrapes Australian stores and eBay AU for current prices, and serves those prices through a Next.js web UI.

The goal: a self-hosted, self-sustaining price tracker for AU MTG players to compare what stores charge vs eBay market prices.

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
| Scheduling | `node-cron` |
| Web app | Next.js 15 (App Router) |
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

Runs as a long-lived Docker service. Three cron jobs:
- **3 AM daily** → Scryfall bulk import (refreshes all card/printing data)
- **5 AM daily** → Store HTML scrapers (MTG Mate, Good Games)
- **6 AM daily** → eBay AU price import

Also runs an initial Scryfall import on startup if the DB is empty.

### `apps/scraper/src/lib/schema.ts`
Drizzle ORM schema — **source of truth for DB structure**.

Tables:
- **`cards`** — One row per unique MTG game object (oracle_id). ~32,330 rows.
- **`printings`** — One row per physical card version. ~141,656 rows. Has `card_id` FK, set code, foil flag, USD reference price, `released_at`.
- **`stores`** — Australian retailers + eBay AU. Seeded manually.
- **`store_prices`** — Current prices from stores/eBay. Overwritten each scrape run.
- **`price_history`** — Daily snapshots. Append-only.
- **`unmatched_cards`** — Scraped listings that couldn't be matched to a Scryfall printing.

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

### `apps/scraper/src/stores/goodgames.ts`
Good Games HTML scraper. NM-only. Match quality: **92.3% exact, 99.5% high-conf** over ~35k entries.
Key behaviours:
- Borderless detection via `\bborderless\b` word match
- Collector number extraction from `(NNNN)` 4-digit pattern in title
- LotR-style named lands: `extractLotRStyleName()` swaps in Scryfall card name
- Tokens/emblems filtered via `isTokenOrEmblem()`
- Skips Extended Art, Showcase, Retro Frame, Alternate Art, Serialized (no collector number = can't reliably match)

### `apps/scraper/src/ebay/`
Full eBay AU import pipeline:
- `oauth.ts` — Client Credentials token
- `browse-client.ts` — Browse API search with rate limiting (500ms) + retry (3x with 5s/15s/30s backoff)
- `transform.ts` — Parses messy eBay titles into `ScrapedCard` objects
- `ebay-import.ts` — Orchestrates: search → parse → match → upsert

eBay import deletes all `store_prices` rows for `ebay_au` at start of each run, then repopulates. If interrupted, re-run to repopulate.

---

## apps/web — Next.js front-end

### Search page (`apps/web/src/app/page.tsx`)
- Full-text card search with infinite scroll (20 results/page)
- Scrymarket price: median of cheapest printing's in-stock sell prices
- Trend badge (↑/↓/→) vs `price_history`
- Card thumbnails (63×88px), color identity pips, CardMagnifier on hover
- Drag-to-search: drag any Scryfall card image onto the app

### Card detail page (`apps/web/src/app/cards/[id]/page.tsx`)
- Two-column layout: sticky card image + info/table/chart
- Market snapshot: Low / Scrymarket / High AUD, USD reference, trend badge
- Prices table: flat rows (printing × store), filter dropdowns, pagination
- Set symbols: Scryfall SVGs tinted by rarity, `❖` fallback for missing
- Row hover changes card image to that printing's art
- Price history chart: area chart (overall) + line chart by printing (max 8)

---

## Database setup

### First-time setup
```bash
cp .env.example .env
# Edit .env with real values

docker compose up db -d
pnpm db:migrate
pnpm --filter @mtg-au/scraper seed
pnpm scrape:scryfall   # ~10-15 min, downloads 300MB
```

### Useful DB commands
```bash
pnpm db:generate    # Generate a migration after schema changes
pnpm db:migrate     # Apply pending migrations
pnpm db:studio      # Drizzle Studio at localhost:4983
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
| `USER_AGENT` | HTTP User-Agent for scraping | `Scrymarket/1.0` |
| `AUD_USD_RATE` | Static USD→AUD rate | `0.65` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token for `cloudflared` tunnel service | — |

---

## What's been built

- [x] pnpm monorepo with scraper, web, and shared packages
- [x] Docker Compose dev + prod environments
- [x] PostgreSQL schema via Drizzle ORM
- [x] Scryfall bulk import (~32k cards, ~141k printings)
- [x] Card matcher with exact / name-only / fuzzy / collector-number matching
- [x] eBay AU import pipeline (OAuth → Browse API → title parser → DB)
- [x] Good Games HTML scraper (99.5% high-confidence match rate)
- [x] Next.js web UI — search, card detail, price history charts
- [x] Cloudflare tunnel for public access (no open ports)
- [x] Security headers (CSP, X-Frame-Options, etc.) via Next.js config

## What's next

- [ ] **Logging** — Add `pino` structured logging to scraper
- [ ] **Monitoring** — `prom-client` pushing metrics to Pushgateway → Prometheus → Grafana
- [ ] **MTG Mate scraper** — HTML scraper for mtgmate.com.au
- [ ] **AWS deployment** — ECS + RDS (Milestone 6)

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
