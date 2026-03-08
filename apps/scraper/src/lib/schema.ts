/**
 * Database schema — defines all tables using Drizzle ORM.
 *
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
  date,
} from "drizzle-orm/pg-core";

// ─── Cards ────────────────────────────────────────────────────────────────────
// One row per unique game object, keyed by Scryfall oracle_id.
// All printings of Lightning Bolt share one row here.

export const cards = pgTable(
  "cards",
  {
    id: text("id").primaryKey(),                           // Scryfall oracle_id
    name: text("name").notNull(),
    manaCost: text("mana_cost"),
    typeLine: text("type_line").notNull(),
    oracleText: text("oracle_text"),
    colors: text("colors").array().notNull().default([]),
    colorIdentity: text("color_identity").array().notNull().default([]),
    legalities: jsonb("legalities").notNull().default({}),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("cards_name_idx").on(table.name),                // fast name lookups
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
    imageUri: text("image_uri"),
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
// TODO: convert to monthly partitioned table before data accumulates.

export const priceHistory = pgTable(
  "price_history",
  {
    id: serial("id").primaryKey(),
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
  ]
);

// ─── Unmatched cards ──────────────────────────────────────────────────────────
// Scraped listings that couldn't be matched to a Scryfall printing.
// Used for debugging the matcher and improving SET_ALIASES.

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
