# Development Guide

## Prerequisites

- Docker + Docker Compose
- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)

---

## First-Time Setup

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and EBAY_CLIENT_ID / EBAY_CLIENT_SECRET

# 2. Start the database
docker compose up db -d

# 3. Apply migrations and seed stores
docker compose run --rm scraper pnpm --filter @mtg-au/scraper db:migrate
docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed

# 4. Start all services
docker compose up -d

# Scryfall import runs automatically on first boot (~10-15 min)
# Monitor: docker compose logs -f scraper
```

## Running Tests

```bash
# All tests (shared + scraper + web)
pnpm test

# Watch mode
pnpm test --watch

# Single workspace
pnpm --filter @mtg-au/web test
pnpm --filter @mtg-au/scraper test
pnpm --filter @mtg-au/shared test
```

Tests are co-located with source files (`*.test.ts`). Test config: `vitest.workspace.ts`.

## Type Checking

```bash
pnpm tsc --noEmit
```

Run this before pushing. TypeScript strict mode is enforced across all packages.

## Development Servers

```bash
# Web app (Next.js hot reload)
pnpm --filter @mtg-au/web dev

# Or via Docker Compose (matches prod behaviour)
docker compose up web
```

---

## Common Commands

### Database

```bash
# Apply migrations
docker compose run --rm scraper pnpm --filter @mtg-au/scraper db:migrate

# Generate migration after schema change
docker compose run --rm scraper pnpm --filter @mtg-au/scraper db:generate

# Re-seed stores table
docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed

# Connect to DB directly
docker compose exec db psql -U mtg mtg_tracker
```

### Scrapers

```bash
# Run all store scrapers once
docker compose run --rm scraper pnpm --filter @mtg-au/scraper scrape:stores

# Run eBay import once
docker compose run --rm scraper pnpm --filter @mtg-au/scraper scrape:ebay

# Rerun Scryfall bulk import
docker compose run --rm scraper pnpm --filter @mtg-au/scraper import:scryfall
```

### Store validation & eBay improvement

```bash
# Validate all Shopify store configs (output: table + JSON)
pnpm --filter @mtg-au/scraper validate:all-stores

# Suggest SET_ALIASES improvements from unmatched_cards
pnpm --filter @mtg-au/scraper suggest:aliases
```

---

## Adding a Shopify Store

1. Find the collection handle: browse `https://{store-domain}/collections.json` and look for the MTG singles slug.

2. Add to `apps/scraper/src/stores/shopify-stores.config.ts`:
   ```ts
   { id: "my_store", baseUrl: "https://mystore.com.au", collectionHandle: "magic-singles" }
   ```

3. Add to `apps/scraper/src/seed.ts`:
   ```ts
   { id: "my_store", name: "My Store", url: "https://mystore.com.au", scraperEnabled: true }
   ```

4. Add flat-rate postage to `apps/web/src/lib/store-shipping.ts`:
   ```ts
   my_store: 9.95,  // or null for per-item shipping
   ```

5. Seed and verify:
   ```bash
   docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed
   pnpm --filter @mtg-au/scraper validate:all-stores
   ```

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://mtg:changeme@localhost:5432/mtg_tracker` |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | eBay API credentials | — |
| `EBAY_DAILY_TARGET` | Max eBay searches per daily run | `4500` |
| `EBAY_RECENT_MONTHS` | How far back eBay prices count as recent | `3` |
| `EBAY_HIGH_VALUE_USD` | USD threshold for high-value card search pass | `50` |
| `AUD_USD_RATE` | Static USD→AUD rate (replaces live rate) | `0.65` |
| `USER_AGENT` | HTTP User-Agent for store scraping | `Scrymarket/1.0` |
| `SCRYFALL_BULK_URL` | Scryfall bulk data API | `https://api.scryfall.com/bulk-data` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token for cloudflared tunnel | — |

---

## Project Structure Conventions

- **Types and pure utilities** → `packages/shared/src/`
- **DB queries** → `apps/web/src/lib/db.ts` only (do not query the DB from components or routes directly)
- **Store scrapers** → `apps/scraper/src/stores/` (one file per scraper, one config for Shopify)
- **API routes** → `apps/web/src/app/api/` — always use `withErrorHandler()` from `@/lib/api-helpers`
- **Rate limits** → defined as constants in `apps/web/src/lib/config.ts`, applied via `createRateLimiter()` from `@/lib/rate-limit`
- **Tests** → co-located with source (e.g. `route.ts` → `route.test.ts` or `algorithm.test.ts`)

---

## Pushing Wiki Pages to GitHub

The `docs/wiki/` directory contains the source for this wiki. To push to GitHub wiki:

```bash
git clone https://github.com/luperr/mtg-au-tracker.wiki.git /tmp/mtg-wiki
cp docs/wiki/*.md /tmp/mtg-wiki/
cd /tmp/mtg-wiki
git add .
git commit -m "Update wiki from docs/wiki/"
git push
```
