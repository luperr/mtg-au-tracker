/**
 * Database schema — defines all tables using Drizzle ORM.
 *
 *   sets            — one row per Scryfall set (set_code PK, set_type, parent_set_code)
 *   cards           — one row per unique MTG game object (oracle_id)
 *   printings       — one row per physical card version (scryfall card id)
 *   stores          — Australian retailers + eBay AU
 *   store_prices    — current prices scraped from each store (refreshed each run)
 *   price_history   — daily price snapshots (append-only)
 *   unmatched_cards — scraped listings that couldn't be matched to a printing
 *
 * NOTE: price_history must be converted to a monthly partitioned table before
 * data starts accumulating. See memory/MEMORY.md for details.
 *
 * "Lightning Bolt" is one card. "Lightning Bolt from M11 nonfoil" is one printing.
 */

import {
  pgTable,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
  serial,
  integer,
  date,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
// Note: price_history is a PARTITIONED table (RANGE by recorded_at, monthly).
// Drizzle does not model the partition structure — it sees the parent table only.
// The id column was dropped as part of partitioning; natural key is
// (printing_id, store_id, price_type, recorded_at).

// ─── Sets ─────────────────────────────────────────────────────────────────────
// One row per Scryfall set, populated by the Sets API during bulk import.
// parent_set_code links child releases (Commander decks, Secret Lairs, promos)
// back to their parent expansion. NULL = root set.

export const sets = pgTable("sets", {
  setCode: text("set_code").primaryKey(),                  // e.g. "ecl", "pecl"
  setName: text("set_name").notNull(),
  setType: text("set_type"),                               // nullable until first Scryfall import
  parentSetCode: text("parent_set_code"),                  // NULL = root set
  releasedAt: date("released_at").notNull(),
  cardCount: integer("card_count").notNull().default(0),
  iconSvgUri: text("icon_svg_uri"),
  setValueAud: numeric("set_value_aud"),                   // updated after each nightly store scrape
});

// ─── Cards ────────────────────────────────────────────────────────────────────
// One row per unique game object, keyed by Scryfall oracle_id.
// All printings of Lightning Bolt share one row here.

export const cards = pgTable(
  "cards",
  {
    id: text("id").primaryKey(),                           // Scryfall oracle_id
    name: text("name").notNull(),
    slug: text("slug"),                                    // URL-safe slug, e.g. "lightning-bolt"
    manaCost: text("mana_cost"),
    typeLine: text("type_line").notNull(),
    oracleText: text("oracle_text"),
    colors: text("colors").array().notNull().default([]),
    colorIdentity: text("color_identity").array().notNull().default([]),
    legalities: jsonb("legalities").notNull().default({}),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    scrymarketPrice: numeric("scrymarket_price"),              // pre-computed nightly: median sell price of cheapest printing
    priceTrend: text("price_trend"),                           // pre-computed nightly: 'up' | 'down' | 'neutral' | null
  },
  (table) => [
    index("cards_name_idx").on(table.name),                // fast name lookups
    uniqueIndex("cards_slug_idx").on(table.slug),          // slug lookups for SEO routes
    // Trigram index for the leading-wildcard ILIKE in searchCards()/countCards();
    // a btree can't serve '%bolt%'. Requires the pg_trgm extension (migration 0013).
    index("cards_name_trgm_idx").using("gin", sql`${table.name} gin_trgm_ops`),
  ]
);

// ─── Printings ────────────────────────────────────────────────────────────────
// One row per physical version. Foil and nonfoil are separate rows.
// "Lightning Bolt from M11, nonfoil" is one printing.

export const printings = pgTable(
  "printings",
  {
    id: text("id").primaryKey(),                           // Scryfall card id (+ "_foil" for foils)
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id),                        // FK → cards.id
    setCode: text("set_code").notNull(),
    setName: text("set_name").notNull(),
    releasedAt: date("released_at").notNull().default("1993-01-01"),
    collectorNumber: text("collector_number").notNull(),
    rarity: text("rarity").notNull(),
    isFoil: boolean("is_foil").notNull().default(false),
    finish: text("finish").notNull().default("nonfoil"),           // "nonfoil" | "foil" | "etched"
    borderColor: text("border_color"),                             // Scryfall border_color, nullable
    frameEffects: text("frame_effects").array().notNull().default([]), // e.g. ["showcase"] | ["extendedart"]
    imageUri: text("image_uri"),
    imageUriBack: text("image_uri_back"),                    // back face for DFCs; null for normal cards
    scryfallUri: text("scryfall_uri").notNull(),
    usdPrice: text("usd_price"),                          // stored as text to avoid float rounding
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("printings_card_id_idx").on(table.cardId),      // fast "all printings of card X" lookups
    index("printings_set_code_idx").on(table.setCode),
  ]
);

// ─── Stores ───────────────────────────────────────────────────────────────────
// Australian retailers and eBay AU. Seeded manually via seed.ts.

export const stores = pgTable("stores", {
  id: text("id").primaryKey(),                             // slug: "mtg_mate", "ebay_au"
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  scraperEnabled: boolean("scraper_enabled").notNull().default(false),
  logoUrl: text("logo_url"),                               // custom logo URL; null falls back to favicon service
  flatShippingAud: text("flat_shipping_aud"),              // flat postage estimate; null = per-item/unknown (e.g. eBay)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Store prices ─────────────────────────────────────────────────────────────
// Current prices for a printing at a store. Fully replaced on each scrape run
// (delete all rows for the store, then bulk-insert fresh data).
// No unique constraint by design — see CLAUDE.md key design decisions.

export const storePrices = pgTable(
  "store_prices",
  {
    id: serial("id").primaryKey(),
    printingId: text("printing_id")
      .notNull()
      .references(() => printings.id),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    priceAud: text("price_aud").notNull(),                 // stored as text to avoid float rounding
    shippingAud: text("shipping_aud"),                     // AUD shipping cost, null if unknown, "0.00" if free
    priceType: text("price_type").notNull(),               // "sell" | "buylist"
    condition: text("condition"),                          // "NM", "LP", "MP", etc.
    inStock: boolean("in_stock").notNull().default(true),
    url: text("url"),
    scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
  },
  (table) => [
    index("store_prices_printing_store_idx").on(table.printingId, table.storeId),
    index("store_prices_store_id_idx").on(table.storeId),
  ]
);

// ─── Price history ────────────────────────────────────────────────────────────
// One row per printing/store/priceType per day. Append-only — never updated.
// Partitioned by recorded_at (monthly RANGE). See migration 0004.

export const priceHistory = pgTable(
  "price_history",
  {
    printingId: text("printing_id")
      .notNull()
      .references(() => printings.id),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    priceAud: text("price_aud").notNull(),
    priceType: text("price_type").notNull(),               // "sell" | "buylist"
    recordedAt: date("recorded_at").notNull(),             // date only, not timestamp
  },
  (table) => [
    uniqueIndex("price_history_unique_daily_idx").on(
      table.printingId,
      table.storeId,
      table.priceType,
      table.recordedAt,
    ),
    index("price_history_recorded_at_idx").on(table.recordedAt),
    index("price_history_store_id_idx").on(table.storeId),
  ]
);

// ─── Unmatched cards ──────────────────────────────────────────────────────────
// Scraped listings that couldn't be matched to a Scryfall printing.
// Used for debugging the matcher and improving match coverage.

export const unmatchedCards = pgTable(
  "unmatched_cards",
  {
    id: serial("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    rawName: text("raw_name").notNull(),
    rawSetName: text("raw_set_name"),
    rawPrice: text("raw_price"),
    sourceUrl: text("source_url"),
    scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
  },
  (table) => [
    index("unmatched_cards_store_id_idx").on(table.storeId),
  ]
);

// ─── eBay Search Log ──────────────────────────────────────────────────────────
// Tracks when each unique card name was last searched on eBay and how many raw
// results came back. Drives the tiered scheduler — hot cards searched daily,
// active cards every 3 days, long-tail cards weekly. Zero-result cards are
// backed off automatically to avoid wasting quota.

export const ebaySearchLog = pgTable("ebay_search_log", {
  cardName: text("card_name").primaryKey(),
  lastSearchedAt: date("last_searched_at").notNull(),
  lastResultCount: integer("last_result_count").notNull().default(0),
});

// ─── Card Searches ────────────────────────────────────────────────────────────
// Append-only log of user card searches. One row per search event.
// Powers the "top searched cards" store dashboard and demand analytics.

export const cardSearches = pgTable(
  "card_searches",
  {
    id: serial("id").primaryKey(),
    cardId: text("card_id").references(() => cards.id), // null if query matched no card
    query: text("query").notNull(),                     // raw user query string
    searchedAt: timestamp("searched_at").notNull().defaultNow(),
  },
  (table) => [
    index("card_searches_card_id_idx").on(table.cardId),
    index("card_searches_searched_at_idx").on(table.searchedAt),
  ]
);

// ─── Market Movers ────────────────────────────────────────────────────────────
// Pre-computed top 3 price gainers and losers for 7 / 14 / 30 day windows.
// Always exactly 18 rows. TRUNCATE + INSERT inside a transaction on each nightly run.

export const marketMovers = pgTable(
  "market_movers",
  {
    id: serial("id").primaryKey(),
    windowDays: integer("window_days").notNull(),       // 7 | 14 | 30
    direction: text("direction").notNull(),              // 'up' | 'down'
    rank: integer("rank").notNull(),                     // 1 | 2 | 3
    cardId: text("card_id").notNull().references(() => cards.id),
    setCode: text("set_code").notNull(),
    setName: text("set_name").notNull(),
    name: text("name").notNull(),
    slug: text("slug"),
    imageUri: text("image_uri"),
    startPrice: numeric("start_price").notNull(),
    currentPrice: numeric("current_price").notNull(),
    pctChange: numeric("pct_change").notNull(),
    computedAt: timestamp("computed_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("market_movers_unique_idx").on(table.windowDays, table.direction, table.rank),
  ]
);

// ─── Set card daily ───────────────────────────────────────────────────────────
// Pre-aggregated daily price per (set, card) — the cheapest non-foil sell price
// seen that day across every printing of the card in that set.
//
// Why this exists: the set pages used to aggregate price_history live on every
// request. price_history is ~18GB across seven monthly partitions and carries no
// set_code, so filtering to one set meant scanning the lot — minutes per request
// on spinning disks, and requests arrived faster than they drained. This table is
// the same aggregate keyed by set_code, so a set page reads only its own rows.
//
// Basic lands and foils are excluded at build time to match the set-page queries.
// Append-only in practice: filled one recorded_at at a time by the nightly market
// stats task, which also backfills any dates it finds missing.

export const setCardDaily = pgTable(
  "set_card_daily",
  {
    setCode: text("set_code").notNull(),
    cardId: text("card_id").notNull().references(() => cards.id),
    recordedAt: date("recorded_at").notNull(),
    minPrice: numeric("min_price").notNull(),
  },
  (table) => [
    // Leading set_code + recorded_at serves the set-page lookups directly.
    uniqueIndex("set_card_daily_unique_idx").on(
      table.setCode,
      table.recordedAt,
      table.cardId,
    ),
  ]
);
