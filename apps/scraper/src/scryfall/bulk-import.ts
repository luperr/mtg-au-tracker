import { db, schema } from "../lib/db.js";
import {
  shouldImport,
  transformScryfallCard,
  type ScryfallCard,
  type CardRow,
  type PrintingRow,
} from "./transform.js";
import { sql } from "drizzle-orm";

const SCRYFALL_BULK_URL =
  process.env.SCRYFALL_BULK_URL ?? "https://api.scryfall.com/bulk-data";
const USER_AGENT = process.env.USER_AGENT ?? "MTGAUTracker/1.0";
const BATCH_SIZE = 500;

/**
 * Fetch the download URL for Scryfall's "default_cards" bulk data file.
 * This file contains every card object with prices.
 */
async function getBulkDataUrl(): Promise<string> {
  console.log("Fetching bulk data catalog from Scryfall...");

  const response = await fetch(SCRYFALL_BULK_URL, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch bulk data catalog: ${response.status}`);
  }

  const catalog = (await response.json()) as {
    data: Array<{ type: string; download_uri: string; size: number }>;
  };

  const defaultCards = catalog.data.find((d) => d.type === "default_cards");
  if (!defaultCards) {
    throw new Error("Could not find default_cards in bulk data catalog");
  }

  const sizeMb = (defaultCards.size / 1024 / 1024).toFixed(0);
  console.log(`Found default_cards bulk file (${sizeMb}MB)`);

  return defaultCards.download_uri;
}

/**
 * Download and parse the bulk data file.
 * The file is a single JSON array, often 300MB+.
 * We download it fully then parse — streaming JSON parsing adds
 * complexity and the file fits in memory on any reasonable system.
 */
async function downloadBulkData(url: string): Promise<ScryfallCard[]> {
  console.log("Downloading bulk data (this may take a few minutes)...");

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Failed to download bulk data: ${response.status}`);
  }

  const data = (await response.json()) as ScryfallCard[];
  console.log(`Downloaded ${data.length.toLocaleString()} card objects`);

  return data;
}

/**
 * Upsert a batch of card rows into the database.
 * Uses ON CONFLICT to update existing records.
 */
async function upsertCards(rows: CardRow[]): Promise<void> {
  if (rows.length === 0) return;

  await db
    .insert(schema.cards)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.cards.id,
      set: {
        name: sql`excluded.name`,
        nameNormalized: sql`excluded.name_normalized`,
        manaCost: sql`excluded.mana_cost`,
        typeLine: sql`excluded.type_line`,
        oracleText: sql`excluded.oracle_text`,
        colors: sql`excluded.colors`,
        colorIdentity: sql`excluded.color_identity`,
        legalities: sql`excluded.legalities`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/**
 * Upsert a batch of printing rows into the database.
 */
async function upsertPrintings(rows: PrintingRow[]): Promise<void> {
  if (rows.length === 0) return;

  await db
    .insert(schema.printings)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.printings.id,
      set: {
        cardId: sql`excluded.card_id`,
        setCode: sql`excluded.set_code`,
        setName: sql`excluded.set_name`,
        collectorNumber: sql`excluded.collector_number`,
        rarity: sql`excluded.rarity`,
        isFoil: sql`excluded.is_foil`,
        imageUri: sql`excluded.image_uri`,
        scryfallUri: sql`excluded.scryfall_uri`,
        usdPrice: sql`excluded.usd_price`,
        eurPrice: sql`excluded.eur_price`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/**
 * Main import function. Downloads Scryfall bulk data and upserts
 * all cards and printings into the database.
 */
export async function importScryfallData(): Promise<void> {
  const startTime = Date.now();

  // 1. Get the download URL
  const bulkUrl = await getBulkDataUrl();

  // 2. Download the full dataset
  const rawCards = await downloadBulkData(bulkUrl);

  // 3. Filter and transform
  const importableCards = rawCards.filter(shouldImport);
  console.log(
    `${importableCards.length.toLocaleString()} cards to import (filtered from ${rawCards.length.toLocaleString()})`
  );

  // 4. Transform and batch upsert
  // We need to upsert cards first (parent), then printings (child with FK).
  // Deduplicate cards by oracle_id since multiple printings share one card.
  const cardMap = new Map<string, CardRow>();
  const allPrintings: PrintingRow[] = [];

  for (const rawCard of importableCards) {
    const { cardRow, printingRows } = transformScryfallCard(rawCard);

    // Only keep the first (or most recent) card row per oracle_id
    if (!cardMap.has(cardRow.id)) {
      cardMap.set(cardRow.id, cardRow);
    }

    allPrintings.push(...printingRows);
  }

  const allCards = Array.from(cardMap.values());
  console.log(
    `Upserting ${allCards.length.toLocaleString()} unique cards and ${allPrintings.length.toLocaleString()} printings...`
  );

  // Upsert cards in batches
  for (let i = 0; i < allCards.length; i += BATCH_SIZE) {
    const batch = allCards.slice(i, i + BATCH_SIZE);
    await upsertCards(batch);

    if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= allCards.length) {
      const progress = Math.min(i + BATCH_SIZE, allCards.length);
      console.log(
        `  Cards: ${progress.toLocaleString()} / ${allCards.length.toLocaleString()}`
      );
    }
  }

  // Upsert printings in batches
  for (let i = 0; i < allPrintings.length; i += BATCH_SIZE) {
    const batch = allPrintings.slice(i, i + BATCH_SIZE);
    await upsertPrintings(batch);

    if ((i + BATCH_SIZE) % 10000 === 0 || i + BATCH_SIZE >= allPrintings.length) {
      const progress = Math.min(i + BATCH_SIZE, allPrintings.length);
      console.log(
        `  Printings: ${progress.toLocaleString()} / ${allPrintings.length.toLocaleString()}`
      );
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nScryfall import complete in ${elapsed}s`);
  console.log(`  Cards: ${allCards.length.toLocaleString()}`);
  console.log(`  Printings: ${allPrintings.length.toLocaleString()}`);
}

// Allow running directly: pnpm scrape:scryfall
const isDirectRun =
  process.argv[1]?.endsWith("bulk-import.ts") ||
  process.argv[1]?.endsWith("bulk-import.js");

if (isDirectRun) {
  importScryfallData()
    .then(() => {
      console.log("Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Scryfall import failed:", err);
      process.exit(1);
    });
}
