# Scrymarket

Self-hosted AUD price tracker for Magic: The Gathering singles — scrapes 24+ Australian stores and eBay AU daily, served through a Next.js web UI.

## What it does

- **Price comparison** — every in-stock printing across all stores, filterable by set, condition, and foil
- **eBay AU market prices** — daily Browse API import gives a live secondary market reference alongside store prices
- **Price history** — daily snapshots per printing per store, charted as area and per-printing line charts
- **Want List optimiser** — Branch-and-Bound over store subsets finds the cheapest combination accounting for flat-rate postage (added once per store, not per card)

## Design decisions

- **Card vs Printing split** — "Lightning Bolt" appears in 20+ sets; one `Card` row per game object, one `Printing` per physical version. Store prices attach to Printings. Avoids duplicating card metadata and makes cross-printing price comparison natural.
- **Async generator scraper contract** — `scrapeAll()` returns `AsyncGenerator<ScrapedCard>` so the orchestrator processes results incrementally. No waiting for a full scrape to buffer in memory before matching begins.
- **Branch-and-Bound for the want list optimiser** — the cheapest-store problem is an Uncapacitated Facility Location Problem (2^N subsets). B&B prunes subtrees using an optimistic lower bound (all undecided stores at $0 flat fee), stores sorted cheapest-first to produce tight upper bounds early. Fast in practice for the N stores a user realistically has.
- **Cloudflare Tunnel over open ports** — zero inbound ports exposed on the host. All public traffic goes Cloudflare edge → encrypted tunnel → Docker container. Free TLS, DDoS protection, no firewall rules.

## Stack

| | |
|---|---|
| Language | TypeScript (strict), pnpm monorepo |
| Database | PostgreSQL 16 · Drizzle ORM |
| Web | Next.js 15 |
| Scraping | Cheerio · Shopify `products.json` API · eBay Browse API |
| Infra | Proxmox · Docker Compose · Cloudflare Tunnel · Umami analytics |

```
apps/scraper/    — Scryfall importer, store scrapers, eBay pipeline
apps/web/        — Next.js front-end
packages/shared/ — shared types and utilities
```

## Self-hosting

**Requirements:** Docker + Docker Compose, eBay developer credentials.

```bash
cp .env.example .env   # set DATABASE_URL, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET
docker compose up -d
```

On first boot the scraper imports all Scryfall data (~141k printings, ~10–15 min). After that, three cron jobs run daily (Australia/Sydney):

| Time | Job |
|------|-----|
| 3 AM | Scryfall bulk refresh |
| 5 AM | Store scrapers (21 Shopify stores + MTG Mate) |
| 6 AM | eBay AU import |

Web UI at **http://localhost:3000**.

## Adding a store

Any AU MTG store on Shopify is config-only — no new scraper code:

1. Add entry to `apps/scraper/src/stores/shopify-stores.config.ts` (id, baseUrl, collectionHandle)
2. Add store to `apps/scraper/src/seed.ts` with `scraperEnabled: true`
3. Add flat-rate postage to `apps/web/src/lib/store-shipping.ts`
4. `docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed`

Find the collection handle at `/collections.json` on the store's domain.
