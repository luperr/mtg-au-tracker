# Scrymarket Wiki

Scrymarket is a self-hosted price tracker for Magic: The Gathering singles, focused on Australian dollar pricing across 23 Australian stores and eBay AU.

## Pages

| Page | Description |
|------|-------------|
| [Architecture Overview](Architecture-Overview) | Data flow, tech choices, monorepo structure |
| [Scraper Deep Dive](Scraper-Deep-Dive) | Shopify config guide, eBay pipeline, adding a new store |
| [Data Model](Data-Model) | Tables, relationships, partitioning, design decisions |
| [Analytics & Data Quality](Analytics-and-Data-Quality) | Match rates, market movers, demand-gap concept |
| [Development Guide](Development-Guide) | Local setup, running tests, common commands |
| [Quality Report — April 2026](Quality-Report-April-2026) | Scored comparison against the March 2026 review |

## Quick Start

```bash
cp .env.example .env
docker compose up db -d
docker compose run --rm scraper pnpm --filter @mtg-au/scraper db:migrate
docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed
docker compose up -d
```

Scryfall import runs automatically on first boot (~10–15 min). See the [Development Guide](Development-Guide) for full setup.

## Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict) everywhere |
| Package manager | pnpm monorepo workspaces |
| Database | PostgreSQL 16 via Docker |
| ORM | Drizzle ORM |
| Scraper | Node.js + tsx |
| Web app | Next.js 15 (App Router) |
| Deployment | Docker Compose on Proxmox LXC via Cloudflare tunnel |

## Repository

[github.com/luperr/mtg-au-tracker](https://github.com/luperr/mtg-au-tracker)
