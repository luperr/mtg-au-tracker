/**
 * Database schema — defines all tables using Drizzle ORM.
 *
 * Two tables for now:
 *   cards      — one row per unique MTG game object (oracle_id)
 *   printings  — one row per physical card version (scryfall card id)
 *
 * "Lightning Bolt" is one card. "Lightning Bolt from M11 nonfoil" is one printing.
 */

import {
  pgTable,
  text,
  boolean,
  timestamp,
  index,
  jsonb,
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
