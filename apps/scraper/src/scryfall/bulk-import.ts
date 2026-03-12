/**
 * Scryfall bulk import — fetch + import in one step.
 *
 * Exports runScryfallImport() for use by the scheduler (index.ts).
 * The individual fetch.ts and import.ts scripts remain available for manual use.
 */

import { writeFile, readFile, mkdir } from "fs/promises";
import { join } from "path";
import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { shouldImport, transform, type ScryfallCard } from "./transform.js";

const BULK_API_URL = "https://api.scryfall.com/bulk-data";
const OUTPUT_DIR = "./data";
const OUTPUT_FILE = join(OUTPUT_DIR, "default_cards.json");
const USER_AGENT = "Scrymarket/1.0 (learning project)";
const BATCH_SIZE = 500;

interface BulkDataEntry {
  type: string;
  download_uri: string;
  updated_at: string;
}

interface BulkDataCatalog {
  data: BulkDataEntry[];
}

async function fetchData(): Promise<void> {
  console.log("[Scryfall] Fetching bulk data catalog...");
  const catalogRes = await fetch(BULK_API_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!catalogRes.ok) throw new Error(`Catalog request failed: ${catalogRes.status}`);

  const catalog = (await catalogRes.json()) as BulkDataCatalog;
  const entry = catalog.data.find((d) => d.type === "default_cards");
  if (!entry) throw new Error("Could not find 'default_cards' in Scryfall catalog");

  console.log(`[Scryfall] Downloading bulk data (updated ${entry.updated_at})...`);
  const dataRes = await fetch(entry.download_uri, { headers: { "User-Agent": USER_AGENT } });
  if (!dataRes.ok) throw new Error(`Download failed: ${dataRes.status}`);

  const cards = (await dataRes.json()) as ScryfallCard[];
  console.log(`[Scryfall] Downloaded ${cards.length.toLocaleString()} card objects`);

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(cards));
  console.log(`[Scryfall] Saved to ${OUTPUT_FILE}`);
}

async function importData(): Promise<void> {
  console.log("[Scryfall] Reading saved data...");
  const raw = await readFile(OUTPUT_FILE, "utf-8");
  const allCards = JSON.parse(raw) as ScryfallCard[];

  const importable = allCards.filter(shouldImport);
  console.log(`[Scryfall] ${importable.length.toLocaleString()} cards to import`);

  const cardMap = new Map<string, ReturnType<typeof transform>["cardRow"]>();
  const allPrintings: ReturnType<typeof transform>["printingRows"][number][] = [];

  for (const card of importable) {
    const { cardRow, printingRows } = transform(card);
    if (!cardMap.has(cardRow.id)) cardMap.set(cardRow.id, cardRow);
    allPrintings.push(...printingRows);
  }

  const uniqueCards = [...cardMap.values()];
  const printingMap = new Map(allPrintings.map((p) => [p.id, p]));
  const uniquePrintings = [...printingMap.values()];

  console.log(`[Scryfall] ${uniqueCards.length.toLocaleString()} cards, ${uniquePrintings.length.toLocaleString()} printings`);

  // Insert cards
  for (let i = 0; i < uniqueCards.length; i += BATCH_SIZE) {
    const batch = uniqueCards.slice(i, i + BATCH_SIZE);
    await db.insert(schema.cards).values(batch.map((c) => ({
      id: c.id, name: c.name, manaCost: c.manaCost, typeLine: c.typeLine,
      oracleText: c.oracleText, colors: c.colors, colorIdentity: c.colorIdentity,
      legalities: c.legalities, updatedAt: new Date(),
    }))).onConflictDoUpdate({
      target: schema.cards.id,
      set: {
        name: sql`excluded.name`, manaCost: sql`excluded.mana_cost`,
        typeLine: sql`excluded.type_line`, oracleText: sql`excluded.oracle_text`,
        colors: sql`excluded.colors`, colorIdentity: sql`excluded.color_identity`,
        legalities: sql`excluded.legalities`, updatedAt: sql`excluded.updated_at`,
      },
    });
  }
  console.log("[Scryfall] Cards inserted ✓");

  // Insert printings
  for (let i = 0; i < uniquePrintings.length; i += BATCH_SIZE) {
    const batch = uniquePrintings.slice(i, i + BATCH_SIZE);
    await db.insert(schema.printings).values(batch.map((p) => ({
      id: p.id, cardId: p.cardId, setCode: p.setCode, setName: p.setName,
      releasedAt: p.releasedAt, collectorNumber: p.collectorNumber, rarity: p.rarity,
      isFoil: p.isFoil, imageUri: p.imageUri, scryfallUri: p.scryfallUri,
      usdPrice: p.usdPrice, updatedAt: new Date(),
    }))).onConflictDoUpdate({
      target: schema.printings.id,
      set: {
        releasedAt: sql`excluded.released_at`,
        usdPrice: sql`excluded.usd_price`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
  }
  console.log("[Scryfall] Printings inserted ✓");
}

export async function runScryfallImport(): Promise<void> {
  await fetchData();
  await importData();
  console.log("[Scryfall] Import complete.");
}

// Run directly: tsx src/scryfall/bulk-import.ts
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runScryfallImport().catch((err) => {
    console.error("[Scryfall] Fatal error:", err);
    process.exit(1);
  });
}
