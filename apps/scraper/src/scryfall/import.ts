/**
 * Import Scryfall data into the database.
 *
 * Reads the saved default_cards.json, filters and transforms each card,
 * then upserts everything into the cards and printings tables.
 *
 * "Upsert" means: insert if new, update if already exists.
 * This makes the import safe to re-run — it won't create duplicates.
 *
 * Run with: pnpm import:scryfall
 */

import { readFile } from "fs/promises";
import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { shouldImport, transform, type ScryfallCard } from "./transform.js";

const INPUT_FILE = "./data/default_cards.json";
const BATCH_SIZE = 500;

async function main() {
  console.log("Reading saved Scryfall data...");
  const raw = await readFile(INPUT_FILE, "utf-8");
  const allCards = JSON.parse(raw) as ScryfallCard[];
  console.log(`Total objects: ${allCards.length.toLocaleString()}`);

  // ── Filter and transform ───────────────────────────────────────────────────
  const importable = allCards.filter(shouldImport);
  console.log(`After filtering: ${importable.length.toLocaleString()} cards to import`);

  // Collect unique CardRows (deduplicated by oracle_id)
  // and all PrintingRows
  const cardMap = new Map<string, ReturnType<typeof transform>["cardRow"]>();
  const allPrintings: ReturnType<typeof transform>["printingRows"][number][] = [];

  for (const card of importable) {
    const { cardRow, printingRows } = transform(card);
    if (!cardMap.has(cardRow.id)) {
      cardMap.set(cardRow.id, cardRow);
    }
    allPrintings.push(...printingRows);
  }

  const uniqueCards = [...cardMap.values()];
  // Deduplicate printings by id (handles the foil/etched duplicate case)
  const printingMap = new Map(allPrintings.map((p) => [p.id, p]));
  const uniquePrintings = [...printingMap.values()];

  console.log(`Unique cards:    ${uniqueCards.length.toLocaleString()}`);
  console.log(`Unique printings: ${uniquePrintings.length.toLocaleString()}`);

  // ── Insert cards in batches ────────────────────────────────────────────────
  // Cards must go in first because printings have a foreign key to cards.id
  console.log("\nInserting cards...");
  let cardsDone = 0;

  for (let i = 0; i < uniqueCards.length; i += BATCH_SIZE) {
    const batch = uniqueCards.slice(i, i + BATCH_SIZE);

    await db
      .insert(schema.cards)
      .values(batch.map((c) => ({
        id: c.id,
        name: c.name,
        manaCost: c.manaCost,
        typeLine: c.typeLine,
        oracleText: c.oracleText,
        colors: c.colors,
        colorIdentity: c.colorIdentity,
        legalities: c.legalities,
        updatedAt: new Date(),
      })))
      .onConflictDoUpdate({
        target: schema.cards.id,
        set: {
          name: sql`excluded.name`,
          manaCost: sql`excluded.mana_cost`,
          typeLine: sql`excluded.type_line`,
          oracleText: sql`excluded.oracle_text`,
          colors: sql`excluded.colors`,
          colorIdentity: sql`excluded.color_identity`,
          legalities: sql`excluded.legalities`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    cardsDone += batch.length;
    process.stdout.write(`\r  ${cardsDone.toLocaleString()} / ${uniqueCards.length.toLocaleString()}`);
  }
  console.log(" ✓");

  // ── Insert printings in batches ────────────────────────────────────────────
  console.log("Inserting printings...");
  let printingsDone = 0;

  for (let i = 0; i < uniquePrintings.length; i += BATCH_SIZE) {
    const batch = uniquePrintings.slice(i, i + BATCH_SIZE);

    await db
      .insert(schema.printings)
      .values(batch.map((p) => ({
        id: p.id,
        cardId: p.cardId,
        setCode: p.setCode,
        setName: p.setName,
        collectorNumber: p.collectorNumber,
        rarity: p.rarity,
        isFoil: p.isFoil,
        imageUri: p.imageUri,
        scryfallUri: p.scryfallUri,
        usdPrice: p.usdPrice,
        updatedAt: new Date(),
      })))
      .onConflictDoUpdate({
        target: schema.printings.id,
        set: {
          usdPrice: sql`excluded.usd_price`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    printingsDone += batch.length;
    process.stdout.write(`\r  ${printingsDone.toLocaleString()} / ${uniquePrintings.length.toLocaleString()}`);
  }
  console.log(" ✓");

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
