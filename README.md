# Scrymarket

AUD price tracker for Magic: The Gathering singles in Australia. Pulls card data from Scryfall, scrapes 21+ AU store prices, and tracks eBay AU market prices — served through a Next.js web UI for price comparison, history charts, and want list optimisation.

## Requirements

- Docker & Docker Compose (nothing else needed locally)

## Stack

TypeScript · Next.js 15 · PostgreSQL 16 · Drizzle ORM · Node.js · Docker Compose · Cloudflare Tunnel · Umami

```
apps/scraper/    — Scryfall importer, eBay API client, store scrapers
apps/web/        — Next.js front-end
packages/shared/ — shared types and utilities
docker/          — Dockerfiles
docs/            — Ops reference
```

## Quick start

```bash
cp .env.example .env          # fill in eBay API credentials + DB password
docker compose up             # starts postgres + scraper + web
```

On first boot the scraper imports all Scryfall data (~10 min), then runs store and eBay scrapers on a daily cron schedule. The web UI is available at http://localhost:3000.

## Progress

### Data pipeline

- [x] Scryfall bulk import — 32k cards, 141k printings, daily refresh at 3 AM
- [x] Generic Shopify scraper — 21 AU stores, config-driven (no code changes to add a new store)
- [x] MTG Mate HTML scraper
- [x] eBay AU API client — OAuth, Browse API, rate limiting + retry
- [x] eBay title parser — extracts card name, set, foil, condition from listing titles
- [x] Card matcher — links scraped listings to Scryfall printings (exact → fuzzy fallback)
- [x] eBay tiered scheduler — quota-filling approach, targets stalest cards first
- [x] Price history — append-only daily snapshots per printing/store
- [x] Demand analytics — `card_searches` table logs queries + matched card ID

### Web UI

- [x] Card search with infinite scroll and drag-to-search
- [x] Price comparison table (all printings × all stores, filterable)
- [x] Price history charts (overall + per printing)
- [x] Card magnifier, color identity pips, set symbols
- [x] Want List — add cards, compare stores, edit per-store postage
- [x] Want List optimiser — Branch-and-Bound finds cheapest store combination
- [x] Buy links — centralised tracking and affiliate-ready via `BuyLink` component
- [x] Umami analytics — card-search, card-click, store-click events

### Infrastructure

- [x] Docker Compose dev + prod environments
- [x] PostgreSQL schema with Drizzle ORM migrations
- [x] Self-hosted on Proxmox via Cloudflare tunnel (no open ports)
- [x] Security headers (CSP, X-Frame-Options, etc.)
- [x] Cron jobs pinned to Australia/Sydney timezone

## Roadmap

### Phase 1 — Stability (now)
- [ ] Fix DFC unmatched card bug
- [x] `price_history` table partitioning by month (2.7M rows)
- [ ] Wire `pino` structured logging to scraper (Loki is live)
- [x] DB indexes on FK columns + UNIQUE constraints on price tables
- [ ] Vitest unit tests for card-matcher and normalizeName
- [ ] Pin `:latest` image tags in docker-compose

### Phase 2 — Observability
- [ ] Prometheus + Grafana + Pushgateway on dedicated monitoring LXC
- [ ] `prom-client` gauges per store (match rate, scrape duration)
- [ ] MTG Mate set code cache (~30 min scrape → ~3 min)
- [ ] Live AUD/USD rate feed
- [ ] eBay atomic swap to eliminate zero-price window
- [ ] GitHub Actions CI — typecheck + audit on PR

### Phase 3 — Analytics & Monetisation
- [ ] Demand-gap dashboard — cards searched but not in stock anywhere
- [ ] B2B store dashboards — search trends, buy-link CTR, inventory gaps
- [ ] Sealed product integration
- [ ] Auth layer (NextAuth) + price alerts

### Phase 4 — Scale
- [ ] AWS ECS + RDS deployment
- [ ] BullMQ job queue, public API, additional stores
