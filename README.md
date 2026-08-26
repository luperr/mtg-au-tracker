# Scrymarket

Self-hosted AUD price tracker for Magic: The Gathering singles — scrapes 36 Australian stores plus eBay AU daily, served through a Next.js web UI.

## What it does

- **Price comparison** — every in-stock printing across all stores, filterable by set, condition, and finish
- **eBay AU market prices** — daily Browse API import gives a live secondary market reference alongside store prices
- **Price history** — daily snapshots per printing per store, charted as an overall area chart plus a line per set
- **Want List optimiser** — Branch-and-Bound over store subsets finds the cheapest combination accounting for flat-rate postage (added once per store, not per card)

## Design decisions

- **Card vs Printing split** — "Lightning Bolt" appears in 20+ sets; one `Card` row per game object, one `Printing` per physical version. Store prices attach to Printings. Avoids duplicating card metadata and makes cross-printing price comparison natural.
- **Async generator scraper contract** — `scrapeAll()` returns `AsyncGenerator<ScrapedCard>` so the orchestrator processes results incrementally. No waiting for a full scrape to buffer in memory before matching begins.
- **Shopify via the Storefront GraphQL API, never `products.json`** — Shopify caps array pagination at 25,000 objects and enforces it on the *offset*, so `products.json` silently truncates any store past that line (13 of ours are, the largest at 151k products). The GraphQL walk falls back through collection → filtered product query → keyset windows by `created_at`, each step triggered by Shopify's own pagination error.
- **Branch-and-Bound for the want list optimiser** — the cheapest-store problem is an Uncapacitated Facility Location Problem (2^N subsets). B&B prunes subtrees using an optimistic lower bound (all undecided stores at $0 flat fee), stores sorted cheapest-first to produce tight upper bounds early. Fast in practice for the N stores a user realistically has.
- **Cloudflare Tunnel over open ports** — zero inbound ports exposed on the host. All public traffic goes Cloudflare edge → encrypted tunnel → Docker container. Free TLS, DDoS protection, no firewall rules.

## Stack

| | |
|---|---|
| Language | TypeScript (strict), pnpm monorepo |
| Database | PostgreSQL 16 · Drizzle ORM |
| Web | Next.js 15 · React 19 · Recharts |
| Scraping | Shopify Storefront GraphQL API · Cheerio (CrystalCommerce, MTG Mate) · eBay Browse API |
| Infra | Proxmox · Docker Compose · Cloudflare Tunnel · Umami analytics |
| CI/CD | GitHub Actions → GHCR images; server deploys by pull |

```
apps/scraper/    — Scryfall importer, store scrapers, eBay pipeline
apps/web/        — Next.js front-end
packages/shared/ — shared types and utilities
```

## Self-hosting

**Requirements:** Docker + Docker Compose, eBay developer credentials.

```bash
cp .env.example .env   # set DB_PASSWORD, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET
docker compose up -d
```

On first boot the scraper imports all Scryfall data (~141k printings, ~10–15 min). After that, four cron jobs run daily (Australia/Sydney):

| Time | Job |
|------|-----|
| 3 AM | Scryfall bulk refresh |
| 5 AM | Store scrapers (35 Shopify stores + MTG Mate) |
| 6 AM | eBay AU import |
| 7 AM | Market stats — `set_card_daily` refresh always; the rest gated behind `MARKET_STATS_ENABLED` |

Web UI at **http://localhost:3000**.

## Adding a store

Any AU MTG store on Shopify or CrystalCommerce is config-only — no new scraper code. Add **one** entry to `STORE_REGISTRY` in `apps/scraper/src/stores/stores.config.ts`:

```ts
{
  id: "store_id", name: "Store Name", baseUrl: "https://store.com.au",
  scraperEnabled: true, logoUrl: null,
  flatShippingAud: 6.50,              // null if postage varies per item
  shopify: { collectionHandle: "magic-the-gathering-singles" },
}
```

That single entry drives the scraper, the DB seed, and the web app's shipping fallback — there is no second or third file to edit. Then:

```bash
docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed
docker compose run --rm scraper pnpm --filter @mtg-au/scraper scrape:stores
```

Find the collection handle at `/collections.json` on the store's domain. For CrystalCommerce stores use a `crystalCommerce: { categoryPrefix, maxPagesPerCategory }` block instead — see `CLAUDE.md` for the details and the concurrency limits.

## Development

```bash
docker compose run --rm scraper pnpm test                                  # 405 tests
docker compose run --rm scraper pnpm exec vitest run --project=web         # one project
docker compose run --rm scraper pnpm --filter @mtg-au/web exec tsc --noEmit
```

## Licence

AGPL-3.0-only. See `LICENSE.md`.
