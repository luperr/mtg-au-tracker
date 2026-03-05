# MTG AU Price Tracker — Project Guide

## What this project does

Tracks Australian Dollar (AUD) prices for Magic: The Gathering singles.
It imports all card data from Scryfall (the authoritative MTG card database), then scrapes Australian stores and eBay AU for current prices, and eventually serves those prices through a web UI.

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
| Web app | Next.js (not yet built) |
| Deployment target | Docker Compose locally / AWS ECS + RDS in production |

---

## Monorepo structure

```
mtg-au-tracker/
├── apps/
│   ├── scraper/          ← The data collection service (main focus so far)
│   └── web/              ← Next.js front-end (not yet started)
├── packages/
│   └── shared/           ← TypeScript types and utilities used by both apps
├── docker-compose.yml    ← Runs PostgreSQL + scraper service together
├── .env.example          ← Copy to .env, fill in real values
└── package.json          ← Root workspace scripts
```

---

## packages/shared — Shared types and utilities

Everything here is pure TypeScript with no runtime dependencies. Both `apps/scraper` and `apps/web` import from `@mtg-au/shared`.

### `packages/shared/src/types/card.ts`
Defines the core data shapes that mirror the database schema:

- **`Card`** — Abstract game object. "Lightning Bolt" is one Card regardless of how many sets it appears in. Keyed by Scryfall `oracle_id`.
- **`Printing`** — A specific physical version. "Lightning Bolt from M11, non-foil" is one Printing. Keyed by Scryfall card `id`.
- **`StorePrice`** — A price for a Printing at a specific Store, scraped at a point in time.
- **`PriceHistory`** — Daily snapshot of a price (append-only, one row per printing/store/day).
- **`Store`** — A retailer (MTG Mate, eBay AU, etc.).
- **`CardDetail`** — Composite view: one Card + all its Printings + all their StorePrice rows. Used by the web UI.

### `packages/shared/src/types/scraper.ts`
Defines the scraper contract:

- **`ScrapedCard`** — Raw data extracted from a store before it's matched to Scryfall. Has `rawName`, `setName` (may be null), `price`, `priceType` (sell/buylist), `condition`, `isFoil`, `inStock`, `sourceUrl`.
- **`StoreScraper`** — Interface all HTML store scrapers must implement. Requires `scrapeAll()` (async generator of ScrapedCard) and `healthCheck()`.
- **`MatchResult`** — Result of trying to match a ScrapedCard to a Printing in our DB. Has `matchType` (exact / name_only / fuzzy / unmatched) and `confidence` (0–1).

### `packages/shared/src/utils/matching.ts`
Pure functions for name matching:

- **`normalizeName(name)`** — Lowercases, strips accents, removes punctuation, collapses spaces. "Jace, the Mind Sculptor" → "jace the mind sculptor". Used when storing card names AND when matching scraped names.
- **`levenshteinDistance(a, b)`** — Edit distance for fuzzy matching. Used when exact name match fails.
- **`normalizeSetName(name)`** — Same idea for set names.
- **`SET_ALIASES`** — Map of store set name variants → Scryfall set codes. e.g. "Revised" → "3ed".

### `packages/shared/src/utils/currency.ts`
Simple AUD/USD conversion using a static rate from `AUD_USD_RATE` env var (defaults to 0.65).

---

## apps/scraper — The data collection service

This is the core of the project. It runs as a long-lived service that:
1. Imports all card/printing data from Scryfall (daily at 3 AM)
2. Scrapes AU store prices (daily at 5 AM) — *not yet implemented*
3. Imports eBay AU market prices (daily at 6 AM) — *not yet implemented*

### `apps/scraper/src/lib/schema.ts`
The Drizzle ORM schema — defines all PostgreSQL tables. **This is the source of truth for the DB structure.**

Tables:
- **`cards`** — One row per unique MTG game object (oracle_id). ~25,000 rows after Scryfall import.
- **`printings`** — One row per physical card version. ~80,000+ rows. Each has a `card_id` FK, set code, foil flag, USD reference price.
- **`stores`** — Australian retailers + eBay AU. Seeded manually. ~5 rows.
- **`store_prices`** — Current prices from stores/eBay. Overwritten each scrape run. Can be millions of rows for eBay.
- **`price_history`** — Daily snapshots. Append-only. Used for price trend charts.
- **`unmatched_cards`** — Scraped listings that couldn't be matched to a Scryfall printing. Used for debugging and improving the matcher.

### `apps/scraper/src/lib/db.ts`
Creates the Drizzle database connection using `DATABASE_URL` env var. Exports `db` (the query builder) and `schema` (all table definitions).

### `apps/scraper/drizzle.config.ts`
Tells Drizzle Kit where the schema is and where to write migration files (`./drizzle/` folder). Used by `pnpm db:generate` and `pnpm db:migrate`.

### `apps/scraper/src/seed.ts`
One-time setup: inserts the AU store rows into the `stores` table. Run once after the DB is initialised. Currently seeds: MTG Mate, Good Games, Mana Market, MTG Singles Australia. MTG Mate is the only one with `scraperEnabled: true` so far.

### `apps/scraper/src/index.ts`
The main entry point for the scraper service. Runs forever in Docker. Sets up three cron jobs (currently only Scryfall is active):
- 3 AM daily → Scryfall bulk import
- 5 AM daily → Store HTML scrapers
- 6 AM daily → eBay price import (planned)

Also runs an initial Scryfall import on startup if the DB is empty.

### `apps/scraper/src/scryfall/transform.ts`
Defines the `ScryfallCard` raw type (what the Scryfall API returns) and transforms it into `CardRow` + `PrintingRow` objects ready for DB insert. Also filters out digital cards, tokens, emblems etc (`shouldImport()`). Note: foil and non-foil are stored as separate Printing rows with IDs like `{scryfall_id}` and `{scryfall_id}_foil`.

### `apps/scraper/src/scryfall/bulk-import.ts`
Downloads Scryfall's "default_cards" bulk data file (~300MB JSON), transforms all cards, then batch-upserts them into `cards` and `printings` tables. Uses `ON CONFLICT DO UPDATE` so reruns are safe.

### `apps/scraper/src/stores/base-scraper.ts`
Abstract base class for all HTML store scrapers. Provides:
- `fetchPage(url)` — Fetch with User-Agent header and rate limiting (1 second between requests).
- `healthCheck()` — HEAD request to the store's homepage.
- Abstract methods `scrapeAll()` and `getBaseUrl()` that subclasses must implement.

### `apps/scraper/src/matching/card-matcher.ts`
The matching engine that links scraped card names to Scryfall printings. Builds a fast in-memory index from the DB, then for each ScrapedCard tries:
1. **Exact match** — normalised name + resolved set code. Confidence: 1.0.
2. **Name-only match** — normalised name, ignores set. Confidence: 0.8.
3. **Fuzzy match** — Levenshtein distance ≤ 2. Confidence: 0.6–0.8.
4. **Unmatched** — Saved to `unmatched_cards` table for review.

### `apps/scraper/src/stores/run-all.ts`
Entry point for the store HTML scraping run. Currently a stub — queries enabled stores from the DB, builds the matching index, but doesn't actually scrape anything yet (no HTML scrapers implemented). This is where MTG Mate and other scrapers will be wired in.

---

## Database setup

### First-time setup
```bash
# 1. Copy environment file
cp .env.example .env
# Edit .env with your actual values

# 2. Start PostgreSQL
docker compose up db -d

# 3. Run DB migrations (creates all tables)
pnpm db:migrate

# 4. Seed stores table
pnpm --filter @mtg-au/scraper seed

# 5. Run initial Scryfall import (~10-15 min, downloads 300MB)
pnpm scrape:scryfall
```

### Useful DB commands
```bash
pnpm db:generate    # Generate a new migration after schema changes
pnpm db:migrate     # Apply pending migrations
pnpm db:studio      # Open Drizzle Studio (visual DB browser) at localhost:4983
```

---

## Running the scraper

```bash
# Development (auto-reloads on file changes)
pnpm dev:scraper

# Run Scryfall import manually
pnpm scrape:scryfall

# Run store scrapers manually (currently a no-op)
pnpm scrape:stores

# Full Docker service (runs scraper + postgres together)
docker compose up
```

---

## Environment variables

See `.env.example` for all variables. Key ones:

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://mtg:changeme@localhost:5432/mtg_tracker` |
| `SCRYFALL_BULK_URL` | Scryfall API endpoint | `https://api.scryfall.com/bulk-data` |
| `SCRAPE_CRON_SCRYFALL` | Cron schedule for Scryfall import | `0 3 * * *` (3 AM daily) |
| `SCRAPE_CRON_STORES` | Cron schedule for store scrapers | `0 5 * * *` (5 AM daily) |
| `USER_AGENT` | HTTP User-Agent header for scraping | `MTGAUTracker/1.0` |
| `AUD_USD_RATE` | Static exchange rate for USD→AUD conversion | `0.65` |

---

## What's been built

- [x] pnpm monorepo with `apps/scraper` and `packages/shared` placeholder
- [x] Docker Compose dev environment — no local Node/pnpm required
- [x] PostgreSQL schema: `cards` and `printings` tables via Drizzle ORM
- [x] `fetch.ts` — downloads Scryfall bulk data (~300MB) to `data/default_cards.json`
- [x] `inspect.ts` — exploration tool to understand the raw data shape
- [x] `transform.ts` — filters out tokens/digital/emblems, splits foil/nonfoil into separate printings
- [x] `import.ts` — batch upserts 32k cards + 141k printings into PostgreSQL

## What's next

Approach: build one small piece at a time, test it works, then move to the next.

### Step 1 — eBay OAuth client
File: `apps/scraper/src/ebay/oauth.ts`
Gets an eBay API access token using the Client Credentials flow.
Test: run the file directly, confirm it prints a token.

### Step 2 — eBay Browse API client
File: `apps/scraper/src/ebay/browse-client.ts`
Searches eBay AU for MTG listings using the Browse API.
Test: run a search for "magic the gathering", confirm JSON results come back.

### Step 3 — eBay title parser
File: `apps/scraper/src/ebay/transform.ts`
Parses messy eBay listing titles into structured ScrapedCard objects.
Test: unit-test a set of real listing titles, check parsed output.

### Step 4 — eBay import orchestrator
File: `apps/scraper/src/ebay/ebay-import.ts`
Ties together: search → parse → match → upsert to DB.
Test: run against live API, check store_prices table for ebay_au rows.

### Step 5 — Wire into scheduler
Add eBay cron to `index.ts`, add ebay_au store to seed, update docker-compose and .env.example.

## Future milestones

- **Milestone 3**: MTG Mate HTML scraper (first real store scraper)
- **Milestone 4**: Good Games scraper
- **Milestone 5**: Next.js web UI — card search, price comparison table, price history charts
- **Milestone 6**: AWS deployment (ECS + RDS)

---

## Key design decisions

**Why separate Card and Printing tables?**
"Lightning Bolt" has been printed in 20+ sets. We store it once as a Card (the game object), then once per physical version as a Printing. Store prices attach to Printings because prices differ between sets (an Alpha Lightning Bolt costs very different from an M11 one).

**Why Drizzle over Prisma?**
Drizzle produces plain SQL, is fast, and keeps the schema in TypeScript with no code generation step at runtime. The schema file IS the source of truth.

**Why async generators for scrapers?**
`scrapeAll()` returns `AsyncGenerator<ScrapedCard>` so the orchestrator can process results incrementally as they arrive, rather than waiting for a full scrape to complete before saving anything. This is important for stores with thousands of listings.

**Why delete-then-insert for eBay prices instead of upsert?**
The `store_prices` table has no unique constraint on `(printing_id, store_id, price_type)` — just an index. Rather than add a constraint and manage ON CONFLICT logic, we delete all rows for `store_id = 'ebay_au'` at the start of each eBay import run, then bulk-insert fresh data. This is safe because eBay prices are market data that gets fully refreshed each run.
