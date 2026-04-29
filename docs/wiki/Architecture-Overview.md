# Architecture Overview

## Data Flow

```
Scryfall bulk API (300MB JSON)
        │
        ▼
  bulk-import.ts          ← upserts cards + printings into PostgreSQL
        │
        ▼
PostgreSQL 16
  ├── cards          (~32k rows — one per unique game object)
  ├── printings      (~141k rows — one per physical version)
  ├── stores         (23 rows — seeded manually)
  ├── store_prices   (current prices — overwritten each run)
  ├── price_history  (daily snapshots — append-only, partitioned by month)
  ├── unmatched_cards (scraped listings that couldn't be matched)
  ├── ebay_search_log (tracks eBay API quota usage)
  └── card_searches  (user search queries — demand analytics)
        │
        ▼
  Store scrapers (cron 5 AM AEST daily)
  ├── shopify.ts + shopify-stores.config.ts  ← 21 stores via one generic class
  ├── mtgmate.ts                              ← HTML scraper
  └── ebay-import.ts                         ← eBay Browse API (cron 6 AM AEST)
        │
        ▼
  card-matcher.ts   ← matches ScrapedCard → Printing (6 match levels)
        │
        ▼
  store_prices / unmatched_cards
        │
        ▼
  compute-market-stats.ts  ← market movers, set timelines (cron after scrape)
        │
        ▼
  Next.js 15 web app
  ├── /                  ← full-text search, infinite scroll
  ├── /cards/[slug]      ← card detail, price history chart
  ├── /sets/[setCode]    ← set analytics, market pulse, rarity breakdown
  └── /want-list         ← want list with B&B optimizer
```

## Monorepo Structure

```
mtg-au-tracker/
├── apps/
│   ├── scraper/     ← Data collection service (Node.js, Drizzle ORM)
│   └── web/         ← Next.js 15 front-end
├── packages/
│   └── shared/      ← Types + pure utilities (no runtime deps)
├── docs/            ← Ops docs, wiki source, quality reports
└── docker-compose.yml
```

**The boundary is intentional and correct.** `packages/shared` contains only types and pure functions — no DB access, no HTTP. Both apps import from `@mtg-au/shared`. All DB queries live in `apps/web/src/lib/db.ts` (web) or inline Drizzle ORM calls in the scraper. Nothing crosses the app boundary at runtime.

## Key Architectural Decisions

### Why separate Card and Printing tables?

"Lightning Bolt" has been printed in 20+ sets. We store it once as a `cards` row (keyed by Scryfall `oracle_id`), then once per physical version as a `printings` row (keyed by Scryfall card `id`). Store prices attach to printings because the price of a 1993 Alpha Lightning Bolt differs from an M11 printing.

### Why Drizzle ORM over Prisma?

Drizzle produces plain SQL. The schema is TypeScript with no code generation step at runtime. Migrations are SQL files under full developer control.

### Why the generic Shopify scraper?

All 21 Shopify-based stores use the same class (`shopify.ts`) with a config entry in `shopify-stores.config.ts`. Adding a new Shopify store requires only a config change — no new code.

### Why async generators for scrapers?

`scrapeAll()` returns `AsyncGenerator<ScrapedCard>` so the orchestrator processes and upserts results incrementally rather than waiting for a full scrape to finish. A 1,800-product scrape starts writing to DB from the first page.

### Why Branch-and-Bound for the Want List optimizer?

The problem is Uncapacitated Facility Location: which subset of flat-rate stores minimises total cost (cards + postage)? Full 2^N enumeration works for small N but B&B prunes subtrees using an optimistic lower bound (open all undecided stores at $0 flat fee). Stores sorted cheapest-flat-rate-first means tight bounds appear early, maximising pruning.

### Why Cloudflare tunnel instead of open ports?

Zero inbound ports exposed. All public traffic: Cloudflare edge → encrypted tunnel → Docker container. No firewall rules, free TLS, DDoS protection.

## Cron Schedule (Australia/Sydney)

| Time | Job |
|------|-----|
| 3:00 AM | Scryfall bulk import |
| 5:00 AM | Store scrapers (Shopify + MTG Mate) |
| 6:00 AM | eBay AU price import |

## API Routes

| Route | Purpose | Rate limit |
|-------|---------|-----------|
| `GET /api/search` | Full-text card search | 30/min |
| `POST /api/contact` | Contact form → GitHub issue | 10/min |
| `POST /api/cards/bulk-lookup` | Bulk card lookup for want list | 10/min |
| `POST /api/optimize` | B&B want list optimizer | 5/min |
| `GET /api/cards/store-printings` | All printings for a card | 120/min |
| `GET /api/contact/printings` | Printings autocomplete | 120/min |
| `GET /api/contact/stores` | Store list | 120/min |
| `GET /api/top-movers` | Market movers (gainers/losers) | 120/min |
