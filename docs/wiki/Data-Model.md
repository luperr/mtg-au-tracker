# Data Model

Schema source of truth: `apps/scraper/src/lib/schema.ts` (Drizzle ORM).

---

## Tables

### `cards`

One row per unique MTG game object. ~32,330 rows.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Scryfall `oracle_id` |
| `name` | text | Canonical card name |
| `slug` | text UNIQUE | URL-safe name (e.g. `lightning-bolt`) |
| `type_line` | text | e.g. "Instant" |
| `color_identity` | text[] | e.g. `["R"]` |
| `mana_cost` | text | e.g. "{R}" |
| `cmc` | numeric | Converted mana cost |
| `oracle_text` | text | Rules text |

### `printings`

One row per physical card version. ~141,656 rows.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Scryfall card `id` |
| `card_id` | text FK → cards | |
| `set_code` | text | e.g. `m11` |
| `set_name` | text | e.g. "Magic 2011" |
| `collector_number` | text | e.g. `"145"` |
| `rarity` | text | common / uncommon / rare / mythic |
| `is_foil` | boolean | |
| `image_uri` | text | Scryfall image URL (front face) |
| `image_uri_back` | text | Back face for DFCs |
| `price_usd` | numeric | Scryfall reference price |
| `released_at` | date | |

### `stores`

23 rows — seeded manually in `apps/scraper/src/seed.ts`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | e.g. `good_games`, `ebay_au` |
| `name` | text | Display name |
| `url` | text | Store homepage |
| `scraper_enabled` | boolean | Whether scraper is active |

### `store_prices`

Current prices from all stores. Overwritten on each scrape run (delete-then-insert for eBay, upsert for Shopify).

| Column | Type | Notes |
|--------|------|-------|
| `printing_id` | text FK → printings | |
| `store_id` | text FK → stores | |
| `price_aud` | numeric | |
| `shipping_aud` | numeric | Per-item shipping (eBay); null for flat-rate stores |
| `price_type` | text | `sell` or `buylist` |
| `condition` | text | NM, LP, MP, HP, DMG |
| `in_stock` | boolean | |
| `url` | text | Direct product link |
| `last_seen` | timestamp | When this price was last observed |

### `price_history`

Daily snapshots. Append-only. One row per printing/store/date.

| Column | Type | Notes |
|--------|------|-------|
| `printing_id` | text FK → printings | |
| `store_id` | text FK → stores | |
| `price_aud` | numeric | |
| `price_type` | text | |
| `recorded_at` | date | The snapshot date |

**Partitioning**: Range-partitioned by `recorded_at` month. Monthly partitions 2025–2028 + DEFAULT catch-all. Add new year's partitions before 2029.

### `unmatched_cards`

Scraped listings that couldn't be matched to a Scryfall printing. Used for debugging and improving match rates.

| Column | Notes |
|--------|-------|
| `store_id` | Which store this came from |
| `raw_name` | The name string from the store |
| `raw_set_name` | The set name string (may be null) |
| `raw_price` | |
| `source_url` | |
| `scraped_at` | |

Use `pnpm --filter @mtg-au/scraper suggest:aliases` to analyse patterns in this table.

### `ebay_search_log`

Tracks when each card name was last searched on eBay and how many results were returned. Drives the tiered eBay scheduler — cards are searched in "stalest first" order to maximise coverage within the daily API quota.

### `card_searches`

Append-only log of user search queries from the web UI. `card_id` is populated from the top search result (best-effort attribution). Powers demand-gap analytics: cards users search for but that aren't in stock anywhere.

---

## Key Design Decisions

### Why delete-then-insert for eBay prices?

`store_prices` has no UNIQUE constraint on `(printing_id, store_id, price_type)`. For eBay, we delete all `ebay_au` rows at the start of each run and bulk-insert fresh data. Safe because eBay prices are fully refreshed each run.

### Why append-only `price_history`?

We never update historical rows — they are a permanent record of what prices looked like on a given day. This makes it safe to query history across arbitrary date ranges without worrying about concurrent mutations.

### Why store `card_id` on `card_searches` from the top result?

The demand-gap report joins user searches against store inventory. At search time, the top result is the most likely intended card. Null is used when no results are returned. This is best-effort attribution — accurate enough for aggregate analytics.

### Why no UNIQUE constraint on `store_prices`?

The delete-then-insert pattern (eBay) and upsert pattern (Shopify) both work correctly without it. Adding a constraint is deferred — enforcing it without a unique index would be expensive on a frequently-written table.

---

## DB Commands

```bash
# Apply pending migrations
docker compose run --rm scraper pnpm --filter @mtg-au/scraper db:migrate

# Generate migration from schema changes
docker compose run --rm scraper pnpm --filter @mtg-au/scraper db:generate

# Seed stores table
docker compose run --rm scraper pnpm --filter @mtg-au/scraper seed
```
