import {
  pgTable,
  text,
  timestamp,
  decimal,
  boolean,
  serial,
  date,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ──────────────────────────────────────────────────

export const priceTypeEnum = pgEnum("price_type", ["sell", "buylist"]);

export const rarityEnum = pgEnum("rarity", [
  "common",
  "uncommon",
  "rare",
  "mythic",
  "special",
  "bonus",
]);

// ─── Cards ──────────────────────────────────────────────────
// One row per unique game object (oracle_id from Scryfall).
// "Lightning Bolt" exists once here regardless of how many sets it's in.

export const cards = pgTable(
  "cards",
  {
    id: text("id").primaryKey(), // scryfall oracle_id
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    manaCost: text("mana_cost"),
    typeLine: text("type_line").notNull(),
    oracleText: text("oracle_text"),
    colors: text("colors").array().notNull().default([]),
    colorIdentity: text("color_identity").array().notNull().default([]),
    legalities: jsonb("legalities").notNull().default({}),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("cards_name_normalized_idx").on(table.nameNormalized),
    index("cards_name_idx").on(table.name),
  ]
);

// ─── Printings ──────────────────────────────────────────────
// One row per physical card version (Scryfall card ID).
// "Lightning Bolt from M11, non-foil" is one printing.

export const printings = pgTable(
  "printings",
  {
    id: text("id").primaryKey(), // scryfall card id
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id),
    setCode: text("set_code").notNull(),
    setName: text("set_name").notNull(),
    collectorNumber: text("collector_number").notNull(),
    rarity: rarityEnum("rarity").notNull(),
    isFoil: boolean("is_foil").notNull().default(false),
    imageUri: text("image_uri"),
    scryfallUri: text("scryfall_uri").notNull(),
    usdPrice: decimal("usd_price", { precision: 10, scale: 2 }),
    eurPrice: decimal("eur_price", { precision: 10, scale: 2 }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("printings_card_id_idx").on(table.cardId),
    index("printings_set_code_idx").on(table.setCode),
  ]
);

// ─── Stores ─────────────────────────────────────────────────

export const stores = pgTable("stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  scraperEnabled: boolean("scraper_enabled").notNull().default(true),
  supportsBuylist: boolean("supports_buylist").notNull().default(false),
});

// ─── Store Prices (current state) ───────────────────────────
// Overwritten each scrape cycle. This is what the UI queries.

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
    priceType: priceTypeEnum("price_type").notNull(),
    priceAud: decimal("price_aud", { precision: 10, scale: 2 }).notNull(),
    condition: text("condition").notNull().default("NM"),
    inStock: boolean("in_stock").notNull().default(true),
    sourceUrl: text("source_url").notNull(),
    scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
  },
  (table) => [
    index("store_prices_printing_id_idx").on(table.printingId),
    index("store_prices_store_id_idx").on(table.storeId),
    index("store_prices_printing_store_idx").on(
      table.printingId,
      table.storeId,
      table.priceType
    ),
  ]
);

// ─── Price History (append-only) ────────────────────────────
// One row per card per store per day. Snapshot from store_prices.

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
    priceType: priceTypeEnum("price_type").notNull(),
    priceAud: decimal("price_aud", { precision: 10, scale: 2 }).notNull(),
    recordedDate: date("recorded_date").notNull(),
  },
  (table) => [
    index("price_history_printing_date_idx").on(
      table.printingId,
      table.recordedDate
    ),
  ]
);

// ─── Unmatched Cards (for review) ───────────────────────────
// Cards scraped from stores that couldn't be matched to Scryfall data.

export const unmatchedCards = pgTable(
  "unmatched_cards",
  {
    id: serial("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    rawName: text("raw_name").notNull(),
    setName: text("set_name"),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
    resolved: boolean("resolved").notNull().default(false),
  },
  (table) => [
    index("unmatched_cards_resolved_idx").on(table.resolved),
  ]
);
