# MTG AU Tracker

Australian Magic: The Gathering price tracker. Aggregates card prices from AU stores into a single AUD market price.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Setup

```bash
# Clone and install
git clone <repo-url> && cd mtg-au-tracker
pnpm install

# Copy env and edit as needed
cp .env.example .env

# Start the database
docker compose up db -d

# Run migrations
pnpm db:generate
pnpm db:migrate

# Seed AU stores
pnpm --filter @mtg-au/scraper seed

# Run initial Scryfall import (~5 min depending on connection)
pnpm scrape:scryfall
```

### Running

```bash
# Full stack via Docker
docker compose up -d

# Or run services individually for development
docker compose up db -d          # database
pnpm dev:scraper                  # scraper with file watching
pnpm dev:web                      # next.js dev server (milestone 3)
```

### Useful Commands

```bash
pnpm db:studio          # Open Drizzle Studio (DB browser)
pnpm scrape:scryfall    # Manual Scryfall import
pnpm scrape:stores      # Manual store scrape
```

## Architecture

See `mtg-price-tracker-architecture.md` for the full architecture document.

**Stack:** TypeScript everywhere — Next.js (frontend + API), Node.js (scraper), PostgreSQL, Drizzle ORM, Docker.

**Structure:**
```
apps/
  web/        → Next.js app (frontend + API routes)
  scraper/    → Scryfall importer + AU store scrapers
packages/
  shared/     → Types, utilities shared across apps
```

## Milestones

- [x] **M1:** Monorepo, DB schema, Scryfall importer
- [ ] **M2:** MTG Mate scraper, card matching
- [ ] **M3:** Search UI, card detail page
- [ ] **M4:** Second store, AUD market price calculation
