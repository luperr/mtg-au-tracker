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
import { SCRYFALL_BULK_API_URL, SCRYFALL_OUTPUT_DIR, SCRYFALL_USER_AGENT, BATCH_SIZE } from "../lib/config.js";
import { shouldImport, transform, type ScryfallCard } from "./transform.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "scryfall" });

function cardNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip diacritics: ü→u, é→e
    .replace(/\/\//g, " ")             // split/DFC "A // B" → "A B"
    .replace(/[^a-z0-9\s]/g, " ")      // non-alphanumeric → space
    .trim()
    .replace(/\s+/g, "-")              // spaces → hyphens
    .replace(/-{2,}/g, "-")            // collapse multiple hyphens
    .replace(/^-|-$/g, "");            // trim leading/trailing hyphens
}
const OUTPUT_FILE = join(SCRYFALL_OUTPUT_DIR, "default_cards.json");

interface BulkDataEntry {
  type: string;
  download_uri: string;
  updated_at: string;
}

interface BulkDataCatalog {
  data: BulkDataEntry[];
}

async function fetchData(): Promise<void> {
  log.info("Fetching Scryfall bulk data catalog");
  const catalogRes = await fetch(SCRYFALL_BULK_API_URL, { headers: { "User-Agent": SCRYFALL_USER_AGENT } });
  if (!catalogRes.ok) throw new Error(`Catalog request failed: ${catalogRes.status}`);

  const catalog = (await catalogRes.json()) as BulkDataCatalog;
  const entry = catalog.data.find((d) => d.type === "default_cards");
  if (!entry) throw new Error("Could not find 'default_cards' in Scryfall catalog");

  log.info({ updated_at: entry.updated_at }, "Downloading Scryfall bulk data");
  const dataRes = await fetch(entry.download_uri, { headers: { "User-Agent": SCRYFALL_USER_AGENT } });
  if (!dataRes.ok) throw new Error(`Download failed: ${dataRes.status}`);

  const cards = (await dataRes.json()) as ScryfallCard[];
  log.info({ card_count: cards.length }, "Downloaded Scryfall card objects");

  await mkdir(SCRYFALL_OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(cards));
  log.debug({ path: OUTPUT_FILE }, "Saved bulk data to file");
}

async function importData(): Promise<void> {
  log.info("Reading saved Scryfall data");
  const raw = await readFile(OUTPUT_FILE, "utf-8");
  const allCards = JSON.parse(raw) as ScryfallCard[];

  const importable = allCards.filter(shouldImport);
  log.info({ card_count: importable.length }, "Cards to import");

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

  log.info({ cards: uniqueCards.length, printings: uniquePrintings.length }, "Prepared data for upsert");

  // Build slug map with collision handling (rare in MTG but handle gracefully)
  const slugsSeen = new Set<string>();
  const cardSlugs = new Map<string, string>(); // oracle_id → slug
  for (const c of uniqueCards) {
    let slug = cardNameToSlug(c.name);
    if (slugsSeen.has(slug)) {
      // Append a suffix using the first 8 chars of the oracle_id
      slug = `${slug}-${c.id.slice(0, 8)}`;
    }
    slugsSeen.add(slug);
    cardSlugs.set(c.id, slug);
  }

  // Insert cards
  for (let i = 0; i < uniqueCards.length; i += BATCH_SIZE) {
    const batch = uniqueCards.slice(i, i + BATCH_SIZE);
    await db.insert(schema.cards).values(batch.map((c) => ({
      id: c.id, name: c.name, slug: cardSlugs.get(c.id)!, manaCost: c.manaCost,
      typeLine: c.typeLine, oracleText: c.oracleText, colors: c.colors,
      colorIdentity: c.colorIdentity, legalities: c.legalities, updatedAt: new Date(),
    }))).onConflictDoUpdate({
      target: schema.cards.id,
      set: {
        name: sql`excluded.name`, slug: sql`excluded.slug`,
        manaCost: sql`excluded.mana_cost`,
        typeLine: sql`excluded.type_line`, oracleText: sql`excluded.oracle_text`,
        colors: sql`excluded.colors`, colorIdentity: sql`excluded.color_identity`,
        legalities: sql`excluded.legalities`, updatedAt: sql`excluded.updated_at`,
      },
    });
  }
  log.info("Cards upserted");

  // Insert printings
  for (let i = 0; i < uniquePrintings.length; i += BATCH_SIZE) {
    const batch = uniquePrintings.slice(i, i + BATCH_SIZE);
    await db.insert(schema.printings).values(batch.map((p) => ({
      id: p.id, cardId: p.cardId, setCode: p.setCode, setName: p.setName,
      releasedAt: p.releasedAt, collectorNumber: p.collectorNumber, rarity: p.rarity,
      isFoil: p.isFoil, imageUri: p.imageUri, imageUriBack: p.imageUriBack,
      scryfallUri: p.scryfallUri, usdPrice: p.usdPrice, updatedAt: new Date(),
    }))).onConflictDoUpdate({
      target: schema.printings.id,
      set: {
        releasedAt: sql`excluded.released_at`,
        imageUri: sql`excluded.image_uri`,
        imageUriBack: sql`excluded.image_uri_back`,
        usdPrice: sql`excluded.usd_price`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
  }
  log.info("Printings upserted");
}

export async function runScryfallImport(): Promise<void> {
  await fetchData();
  await importData();
  log.info("Scryfall import complete");
}

// Run directly: tsx src/scryfall/bulk-import.ts
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runScryfallImport().catch((err) => {
    log.fatal({ err }, "Fatal error");
    process.exit(1);
  });
}
