# MTG AU Tracker — Session Memory

## What's been built (confirmed working)

### Scraper pipeline — end-to-end verified ✓
- **Scryfall import**: 141,656 printings, 32,330 unique card names in DB
- **MTG Mate scraper**: 108,206 cards scraped, 97.3% match rate, ~10–12 min runtime
- **Card matcher**: set+collector#+foil (primary, O(1)) → name+set+foil → name+foil → name-only → fuzzy (Levenshtein ≤ 2)
- **ScrapedCard**: now has `collectorNumber: string | null` field
- **MTG Mate**: extracts collector number from `link_path` last segment (e.g. `/cards/X/M11/149` → `"149"`)
- **run-all.ts**: deletes stale prices, scrapes, matches, batch-inserts store_prices + price_history + unmatched_cards

### Confirmed DB state (post first real scrape)
- `store_prices`: 125,767 rows — price range $0.20–$258,750, avg $26.42 AUD
- `price_history`: 84,289 rows (daily snapshots, first day)
- `unmatched_cards`: 2,939 rows (2.7% — tokens, scheme/plane cards, some SLD variants)
- `stores`: 5 rows (mtg_mate, good_games, mana_market, mtg_singles_aus, ebay_au)
- `cards`: ~32k, `printings`: ~141k — from Scryfall bulk import

### Unmatched card patterns (known, not urgent)
- **Tokens** — in token sets (e.g. `tacr`, `tmkm`) — Scryfall token IDs differ from regular card IDs
- **Scheme/Plane cards** — Archenemy/Planechase (`oarc`, `oe01`, `ohop`, `opca`) — may not be in printings table
- **Secret Lair with `//` in name + variant** — strip logic handles one level of parens but SLD entries sometimes have the canonical name duplicated: "Adrix and Nev // Adrix and Nev (Borderless 1544)" — the base name after stripping is still "Adrix and Nev // Adrix and Nev" which should match, but doesn't — investigate

### Key file locations
- `packages/shared/src/utils/matching.ts` — normalizeName, stripVariant, levenshteinDistance, SET_ALIASES
- `apps/scraper/src/matching/card-matcher.ts` — CardMatcher (build index + match)
- `apps/scraper/src/stores/base-scraper.ts` — Playwright base class, rate limit 500ms
- `apps/scraper/src/stores/mtgmate.ts` — MTG Mate scraper, CONCURRENCY=3
- `apps/scraper/src/stores/run-all.ts` — orchestrator
- `apps/scraper/src/lib/schema.ts` — Drizzle schema (source of truth)
- `apps/scraper/src/lib/db.ts` — DB connection
- `apps/scraper/src/seed.ts` — seed stores table

---

## Next action items (in priority order)

### 1. Option E — Set code cache for MTG Mate (quick win, ~30 min scrape → ~3 min)
- Save valid set codes to `apps/scraper/data/mtgmate-valid-sets.json` after each run
- Daily runs use cache; weekly full re-scan to detect new sets
- See MTG Mate Option E section below for implementation plan

### 2. Wire scraper into the scheduler (index.ts cron jobs)
- `apps/scraper/src/index.ts` currently only has the Scryfall cron (3 AM)
- Add store scraper cron at 5 AM daily calling `run-all.ts` logic
- Add weekly full-scan flag (Sunday = fullScan: true) for Option E

### 3. Investigate and fix unmatched SLD `//` cards
- "Adrix and Nev // Adrix and Nev (Borderless 1544)" fails to match despite being in DB
- Likely a normalization edge case with the double-slash + variant pattern
- Inspect the actual Scryfall printing ID for this card to understand the mismatch

### 4. eBay integration — BLOCKED (waiting on credentials)
- Need eBay Developer account: developer.ebay.com → Production keys (App ID = Client ID, Cert ID = Client Secret)
- Marketplace ID for AU listings: `EBAY_AU`. Auth: Client Credentials flow (no user auth).
- Build order once credentials arrive:
  1. `apps/scraper/src/ebay/oauth.ts` — Client Credentials token fetch
  2. `apps/scraper/src/ebay/browse-client.ts` — Browse API scoped to EBAY_AU
  3. `apps/scraper/src/ebay/transform.ts` — parse messy listing titles → ScrapedCard
  4. `apps/scraper/src/ebay/ebay-import.ts` — search → parse → match → upsert
  5. Wire into scheduler + add ebay_au store to seed

### 5. Next.js web UI (Milestone 5) — basic scaffold done ✓
- **Built**: `apps/web/` with Next.js 15.5 + Tailwind v4 + postgres raw SQL
- **Pages**: `/` (search `?q=`) + `/cards/[id]` (printings + store prices table)
- **Docker**: `web` service on port 3000 — shares Dockerfile.dev + node_modules volume
- **Key files**: `apps/web/src/lib/db.ts` (queries), `apps/web/src/app/page.tsx`, `apps/web/src/app/cards/[id]/page.tsx`
- **Tested**: Lightning Bolt search → 76 printings, $10.00 AUD; card detail 200 OK
- **Next**: price history sparkline, pagination for search, mobile nav improvements

---

## MTG Mate Option E — Set code caching (planned, not built)
Goal: skip probing 697 codes every run when only ~673 have data.
Plan:
- After a successful scrape, write valid codes to `apps/scraper/data/mtgmate-valid-sets.json`
- Daily runs: load cache, only probe cached codes
- Weekly full re-scan (Sunday): ignore cache, probe all 697 to detect new releases
- Implementation: `loadValidSetCache()` / `saveValidSetCache()` in mtgmate.ts; `fullScan: boolean` flag from run-all.ts

---

## MTG Mate scraper technical notes
- Custom Rails + React app, Heroku/Cloudflare (NOT Shopify)
- Set listing: regex `/magic_sets\/([a-z0-9]+)/g` over raw HTML → ~697 set codes
- Data URL: `/magic_sets/{code}/data` — probe directly (no set HTML page needed). 404 = skip silently.
- Card data JSON: `uuid_data` → `Record<uuid, MtgMateCardEntry>`. Keys: `cache_key`, `card_data`, `uuid_data`, `title`.
- `fetchJson()` must use real browser page (Cloudflare blocks `context.request.get`)
- Price: cents integer. `set_code`: Scryfall lowercase. `finish`: "Foil"|"Nonfoil". `condition`: "Regular"=NM.
- Concurrency: `CONCURRENCY=3`. Rate limit: 500ms.

---

## Deferred
- **Unit testing**: Vitest, co-located `.test.ts`. Priority: matching.ts → eBay title parser → DB integration. Do not set up yet.

---

## Deployment path
1. **Proxmox (next)** — Docker Compose on a Proxmox VM/LXC. Same compose file as dev, add web service. Nginx/Traefik for reverse proxy + HTTPS. Scraper runs on cron inside the container.
2. **AWS (later)** — when public access or managed infra is needed: Next.js → Amplify Hosting, Scraper → ECS Fargate Scheduled Tasks (EventBridge), DB → RDS PostgreSQL t4g.micro.

## Architecture decisions
- **Images**: Never stored. Scryfall CDN URLs from `scryfall_id`. No S3.
- **price_history**: Partition by month BEFORE data accumulates. Drop partitions >2 years. Cron for partition drops in scraper.
- **DB workflow**: `db:push` for schema changes (no migration files yet). Scripts: `db:push`, `db:generate`, `db:migrate`.
