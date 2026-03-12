# Scrymarket

AUD price tracker for Magic: The Gathering singles in Australia. Pulls card data from Scryfall, scrapes AU store prices, and tracks eBay AU market prices — eventually served through a web UI for price comparison and history charts.

## Requirements

- Docker & Docker Compose (nothing else needed locally)

## Stack

TypeScript · PostgreSQL 16 · Drizzle ORM · Node.js · Docker Compose

```
apps/scraper/    — Scryfall importer, eBay API client, store scrapers
apps/web/        — Next.js front-end (not started)
packages/shared/ — shared types and utilities
```

## Quick start

```bash
cp .env.example .env          # fill in eBay API credentials + DB password
docker compose up             # starts postgres + scraper service
```

On first boot the scraper imports all Scryfall data (~10 min), then runs eBay and store scrapers on schedule.

## Progress

### Data pipeline

- [x] Scryfall bulk import — 32k cards, 141k printings, daily refresh at 3 AM
- [x] eBay AU API client — OAuth, Browse API search, rate limiting + retry
- [x] eBay title parser — extracts card name, set, foil, condition, price from listing titles
- [x] Card matcher — links scraped listings to Scryfall printings (exact → fuzzy fallback)
- [x] eBay tiered scheduler — rolls searches across days to stay within API quota
  - Hot (≤30 days old): searched daily (~460 cards)
  - Active (≤90 days or ≥$20 USD): every 3 days (~3,700 cards)
  - Long tail (≥$2 USD): weekly (~8,100 cards)
  - ~2,900 API calls/day in steady state (5,000/day limit)
- [x] Price history — append-only daily snapshots per printing/store
- [ ] MTG Mate HTML scraper
- [ ] Good Games / Mana Market scrapers

### Infrastructure

- [x] Docker Compose dev environment
- [x] PostgreSQL schema with Drizzle ORM migrations
- [ ] Server deployment (next step — see below)
- [ ] AWS ECS + RDS production deployment

### Web UI

- [ ] Next.js app (card search, price comparison table, price history charts)

## Next steps — server deployment

The immediate goal is to get the scraper running on a self-hosted server to start building historical price data. The web UI can come later once there's data worth showing.

1. **Provision server** — any Linux VPS with Docker + Docker Compose installed (2 vCPU / 2 GB RAM minimum for the postgres + scraper pair)
2. **Clone repo + configure env** — copy `.env.example` to `.env`, fill in `DATABASE_URL`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`
3. **Run migrations + seed** — `docker compose run --rm dev pnpm --filter @mtg-au/scraper db:migrate` then `seed`
4. **Start services** — `docker compose up -d` — Scryfall bootstraps on first boot, eBay + store scrapers kick off on schedule
5. **Monitor** — `docker compose logs -f dev` to watch scrape runs; check `store_prices` and `price_history` tables to confirm data is accumulating

Once a few weeks of data are in, start on the Next.js web UI (Milestone 5).
