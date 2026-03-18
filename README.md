# Scrymarket

AUD price tracker for Magic: The Gathering singles in Australia. Pulls card data from Scryfall, scrapes AU store prices, and tracks eBay AU market prices — served through a Next.js web UI for price comparison and history charts.

## Requirements

- Docker & Docker Compose (nothing else needed locally)

## Stack

TypeScript · Next.js 15 · PostgreSQL 16 · Drizzle ORM · Node.js · Docker Compose · Cloudflare Tunnel

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
- [x] eBay AU API client — OAuth, Browse API search, rate limiting + retry
- [x] eBay title parser — extracts card name, set, foil, condition, price from listing titles
- [x] Card matcher — links scraped listings to Scryfall printings (exact → fuzzy fallback)
- [x] eBay tiered scheduler — rolls searches across days to stay within API quota
- [x] Price history — append-only daily snapshots per printing/store
- [x] Good Games HTML scraper — 99.5% high-confidence match rate
- [x] MTG Mate HTML scraper
- [ ] Mana Market scraper

### Web UI

- [x] Card search with infinite scroll and drag-to-search
- [x] Price comparison table (all printings × all stores, filterable)
- [x] Price history charts (overall + per printing)
- [x] Card magnifier, color identity pips, set symbols

### Infrastructure

- [x] Docker Compose dev + prod environments
- [x] PostgreSQL schema with Drizzle ORM migrations
- [x] Self-hosted on Proxmox via Cloudflare tunnel (no open ports)
- [x] Security headers (CSP, X-Frame-Options, etc.)
- [ ] Structured logging (pino) + metrics (Prometheus/Grafana)
- [ ] AWS ECS + RDS deployment
