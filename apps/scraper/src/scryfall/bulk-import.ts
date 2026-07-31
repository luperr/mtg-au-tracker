/**
 * Scryfall bulk import — fetch + import in one step.
 *
 * Exports runScryfallImport() for use by the scheduler (index.ts).
 * The individual fetch.ts and import.ts scripts remain available for manual use.
 */

import { mkdir } from "fs/promises";
import { createWriteStream, createReadStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import StreamJson from "stream-json";
import StreamArray from "stream-json/streamers/StreamArray.js";
import { join } from "path";
import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { SCRYFALL_BULK_API_URL, SCRYFALL_OUTPUT_DIR, SCRYFALL_USER_AGENT, BATCH_SIZE } from "../lib/config.js";
import { shouldImport, transform, type ScryfallCard } from "./transform.js";
import { importSets } from "./sets-import.js";
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
  jsonl_download_uri: string;
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
  const dataRes = await fetch(entry.jsonl_download_uri, { headers: { "User-Agent": SCRYFALL_USER_AGENT } });
  if (!dataRes.ok) throw new Error(`Download failed: ${dataRes.status}`);

  await mkdir(SCRYFALL_OUTPUT_DIR, { recursive: true });
  const writeStream = createWriteStream(OUTPUT_FILE);
  await pipeline(Readable.fromWeb(dataRes.body as import("stream/web").ReadableStream), writeStream);
  log.info("Downloaded Scryfall card objects");
  log.debug({ path: OUTPUT_FILE }, "Saved bulk data to file");
}

async function importData(): Promise<void> {
  // Populate sets table first so set_type + parent_set_code are available
  // before any queries that join printings → sets.
  await importSets();

  log.info("Reading saved Scryfall data");

  const cardMap = new Map<string, ReturnType<typeof transform>["cardRow"]>();
  const allPrintings: ReturnType<typeof transform>["printingRows"][number][] = [];

  await new Promise<void>((resolve, reject) => {
    const fileStream = createReadStream(OUTPUT_FILE);
    const jsonParser = StreamJson.parser();
    const arrayStream = StreamArray.streamArray();
    fileStream.pipe(jsonParser).pipe(arrayStream);
    arrayStream.on("data", ({ value }: { value: ScryfallCard }) => {
      if (!shouldImport(value)) return;
      const { cardRow, printingRows } = transform(value);
      if (!cardMap.has(cardRow.id)) cardMap.set(cardRow.id, cardRow);
      allPrintings.push(...printingRows);
    });
    arrayStream.on("end", resolve);
    arrayStream.on("error", reject);
    fileStream.on("error", reject);
  });

  log.info({ card_count: cardMap.size }, "Cards to import");

  const uniqueCards = [...cardMap.values()];
  const printingMap = new Map(allPrintings.map((p) => [p.id, p]));
  const uniquePrintings = [...printingMap.values()];

  log.info({ cards: uniqueCards.length, printings: uniquePrintings.length }, "Prepared data for upsert");

  // Slugs are immutable once set — stable URLs are better for SEO.
  // Load all existing slugs from the DB before generating new ones.
  //
  // Two cases this prevents:
  //   1. A new oracle_id tries to claim a slug held by a stale DB row (Scryfall
  //      occasionally reassigns oracle_ids, leaving an old row behind).
  //   2. A cross-batch ordering race where one row in a batch updates its slug
  //      *away from* a value, and another row in the same batch tries to claim it —
  //      PostgreSQL checks the unique constraint per-row, not after the full batch.
  const existingRows = await db.select({ id: schema.cards.id, slug: schema.cards.slug }).from(schema.cards);
  const existingSlugByOracleId = new Map<string, string>(
    existingRows
      .filter((r: { id: string; slug: string | null }) => r.slug !== null)
      .map((r: { id: string; slug: string | null }) => [r.id, r.slug as string] as [string, string])
  );

  // slugsSeen prevents duplicate assignment within this run.
  // Seed it with slugs held by oracle_ids NOT in this batch (truly immovable).
  const currentOracleIds = new Set(uniqueCards.map((c) => c.id));
  const slugsSeen = new Set<string>();
  for (const [id, slug] of existingSlugByOracleId) {
    if (!currentOracleIds.has(id)) slugsSeen.add(slug);
  }

  const cardSlugs = new Map<string, string>(); // oracle_id → slug
  for (const c of uniqueCards) {
    if (existingSlugByOracleId.has(c.id)) {
      // Card already has a slug — preserve it and mark it taken.
      const existing = existingSlugByOracleId.get(c.id)!;
      cardSlugs.set(c.id, existing);
      slugsSeen.add(existing);
    } else {
      // New card — generate slug with collision detection.
      let slug = cardNameToSlug(c.name);
      if (slugsSeen.has(slug)) {
        slug = `${slug}-${c.id.slice(0, 8)}`;
      }
      slugsSeen.add(slug);
      cardSlugs.set(c.id, slug);
    }
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
        name: sql`excluded.name`,
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
      isFoil: p.isFoil, finish: p.finish, borderColor: p.borderColor, frameEffects: p.frameEffects,
      imageUri: p.imageUri, imageUriBack: p.imageUriBack,
      scryfallUri: p.scryfallUri, usdPrice: p.usdPrice, updatedAt: new Date(),
    }))).onConflictDoUpdate({
      target: schema.printings.id,
      set: {
        releasedAt: sql`excluded.released_at`,
        finish: sql`excluded.finish`,
        borderColor: sql`excluded.border_color`,
        frameEffects: sql`excluded.frame_effects`,
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
