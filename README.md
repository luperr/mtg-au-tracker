# MTG AU Tracker

> Work in progress

AUD price tracker for Magic: The Gathering singles in Australia. Pulls card data from Scryfall, scrapes AU store prices, and eventually serves them through a web UI.

## Requirements

- Docker & Docker Compose (nothing else needed locally)


## Stack

TypeScript · PostgreSQL · Drizzle ORM · Docker

```
apps/scraper/   — Scryfall importer + store scrapers (in progress)
apps/web/       — Next.js front-end (not started)
packages/shared/ — shared types and utilities
```

## Progress

- [x] Scryfall bulk import (32k cards, 141k printings)
- [ ] AU store scrapers
- [ ] Web UI
