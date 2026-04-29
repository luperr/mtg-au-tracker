# Scraper Deep Dive

## Overview

The scraper runs as a long-lived Docker service with three cron jobs. All times are `Australia/Sydney`.

| Cron | Job | Duration |
|------|-----|---------|
| 3:00 AM | Scryfall bulk import | ~15 min |
| 5:00 AM | Store scrapers | ~30–45 min |
| 6:00 AM | eBay AU import | ~2.5 hours |

---

## Shopify Stores

### How it works

`shopify.ts` is a generic scraper class. All 21 Shopify stores share the same code — the only difference between them is the config entry in `shopify-stores.config.ts`.

Shopify's `products.json` API is fetched directly (no HTML scraping). Pagination uses `page=N&limit=250`. Each product is parsed into a `ScrapedCard` via `mapProduct()`.

**SKU-based matching**: When a SKU is present in the format `{SET_CODE}-{COLLECTOR_NUMBER}-{NF|F}` (e.g. `MH3-001-NF`), the scraper resolves the set code and collector number directly — bypassing name fuzzy-matching entirely and achieving 100% confidence on those products.

### Config structure

```ts
// apps/scraper/src/stores/shopify-stores.config.ts
{ id: "good_games", baseUrl: "https://goodgames.com.au", collectionHandle: "magic-the-gathering-singles" }
```

| Field | Description |
|-------|-------------|
| `id` | Must match the `stores.id` in the database (seeded in `seed.ts`) |
| `baseUrl` | Store domain, no trailing slash |
| `collectionHandle` | Shopify collection slug for MTG singles |

### Active Shopify stores

good_games, gameology, plenty_of_games, games_portal, guf, inn_games, irresistible_force, legends_and_collectables, lots_moore, mana_market, pro_gamers, rhystic_nostalgia, tabernacle_games, cardhouse, tcg_singles, chromatic_games, general_games, elemental_arcade, ronin_games, from_the_deep, crit_hit.

### Adding a new Shopify store

1. **`shopify-stores.config.ts`** — add config entry
2. **`seed.ts`** — add store with `scraperEnabled: true`
3. **`apps/web/src/lib/store-shipping.ts`** — add flat-rate postage (or `null` for eBay-style per-item)
4. Seed: `docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed`
5. Test: `pnpm --filter @mtg-au/scraper validate:all-stores`

To find the collection handle: browse `/collections.json` on the store's domain and look for the MTG singles collection slug.

### Validating store configs

```bash
pnpm --filter @mtg-au/scraper validate:all-stores
```

Probes all configured stores and outputs a table:

```
Store                  HTTP  Products  Mapped  Set%  Issues
good_games             200   1847      3241    82%   —
some_store             404   —         —       —     ENDPOINT_404
ronin_games            200   12        0       —     PARSER_REJECTS_ALL
```

Issue codes:
- `ENDPOINT_404` — HTTP non-2xx from the products API
- `EMPTY_COLLECTION` — 200 OK but zero products returned
- `PARSER_REJECTS_ALL` — products returned but zero MTG cards extracted (wrong collection handle)
- `LOW_SET_COVERAGE` — <50% of mapped cards have a recognised set name

Exit code 1 if any store has a critical issue. Pipe JSON to `stdout` for further processing.

---

## Card Matching Pipeline

`card-matcher.ts` matches each `ScrapedCard` to a Scryfall `Printing` via a tiered in-memory index:

| Level | Method | Confidence |
|-------|--------|-----------|
| 0 | Collector number match (set_code + collector + foil) | 1.0 |
| 1 | Exact match (normalised name + resolved set code) | 1.0 |
| 2 | Name + foil match (ignores set) | 0.85 or 0.7 |
| 3 | Name-only match (ignores set and foil) | 0.6 |
| 4 | Front-face DFC match (double-faced card front name) | 0.65 or 0.5 |
| 5 | Fuzzy match (Levenshtein distance ≤ 2) | 0.6–0.8 |
| 6 | Unmatched — saved to `unmatched_cards` | — |

Set names from stores ("FINAL FANTASY") are resolved to Scryfall set codes ("fin") via the `setNameIndex` built from the DB plus `SET_ALIASES` in `packages/shared/src/utils/matching.ts`.

### Improving eBay match rates

```bash
pnpm --filter @mtg-au/scraper suggest:aliases
```

Analyses `unmatched_cards` for `store_id = 'ebay_au'` and outputs:
- **READY TO PASTE** — high-confidence `SET_ALIASES` entries (distance 0 after normalisation)
- **REVIEW REQUIRED** — medium/low confidence suggestions
- **NAME CORRECTIONS** — single-character typos (distance=1, frequency≥3)
- **TOP 20 UNMATCHED** — most common unmatched card names

Never writes to `matching.ts` directly. Paste reviewed entries into `packages/shared/src/utils/matching.ts` `SET_ALIASES` map.

---

## eBay Pipeline

### Architecture

```
ebay-import.ts
  ├── Select N "stalest" cards from card_searches / ebay_search_log
  ├── For each card:
  │     ├── browse-client.ts → eBay Browse API search
  │     ├── transform.ts → parse title into ScrapedCard
  │     └── card-matcher.ts → match to Printing
  └── Bulk upsert matched cards to store_prices
```

### Quota management

- ~5,000 calls/day on production app key (resets midnight Pacific time)
- `REQUEST_DELAY_MS = 500` between calls
- On 429: retries 3× with 5s / 15s / 30s backoff
- `EBAY_DAILY_TARGET` (default 4500) cards searched per run — always fills quota
- Cards are selected by "stalest last-searched" to maximise coverage

### eBay title parsing (`transform.ts`)

eBay titles are unstructured free text. The parser extracts:
- Card name (before set name hint, foil indicators, etc.)
- Set name (after `[`, `(`, `-`, `—` separators)
- Foil flag (from words like "foil", "etched foil")
- Condition (NM, LP, MP, HP, DMG)

Unrecognised set names fall through to name-only matching in the card matcher.

### After an interrupted run

eBay import deletes all `store_prices` rows for `ebay_au` at the start of each run and repopulates. If interrupted, re-run to repopulate:

```bash
docker compose run --rm scraper pnpm --filter @mtg-au/scraper scrape:ebay
```

---

## Scryfall Import

Downloads Scryfall's "default_cards" bulk (~300MB JSON), transforms all cards, batch-upserts into `cards` and `printings`. Safe to rerun — all operations are upserts.

**Memory**: The import currently loads the full JSON into memory (`readFile` + `JSON.parse`). This peaks at ~2GB heap. Workaround: `NODE_OPTIONS=--max-old-space-size=4096` is set in the scraper Docker env. A streaming parser is a planned improvement.

Run manually:
```bash
docker compose run --rm scraper pnpm --filter @mtg-au/scraper import:scryfall
```
