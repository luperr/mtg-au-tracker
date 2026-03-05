/**
 * Step 1: Download Scryfall bulk card data and save it to disk.
 *
 * Scryfall provides a free bulk data API. We use the "default_cards" file
 * which contains every card object (non-digital, with prices).
 *
 * Run with: pnpm scrape:scryfall
 */

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const BULK_API_URL = "https://api.scryfall.com/bulk-data";
const OUTPUT_DIR = "./data";
const OUTPUT_FILE = join(OUTPUT_DIR, "default_cards.json");

// Scryfall asks that all API consumers identify themselves with a User-Agent
const USER_AGENT = "MTGAUTracker/1.0 (learning project)";

interface BulkDataEntry {
  type: string;
  name: string;
  download_uri: string;
  size: number;          // bytes
  updated_at: string;    // ISO timestamp of last update
}

interface BulkDataCatalog {
  data: BulkDataEntry[];
}

// We only extract the fields we need from each card for now
interface RawCard {
  id: string;
  name: string;
  set_name: string;
  type_line?: string;
}

async function main() {
  console.log("Fetching Scryfall bulk data catalog...");

  const catalogRes = await fetch(BULK_API_URL, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!catalogRes.ok) {
    throw new Error(`Catalog request failed with status ${catalogRes.status}`);
  }

  const catalog = (await catalogRes.json()) as BulkDataCatalog;

  const entry = catalog.data.find((d) => d.type === "default_cards");

  if (!entry) {
    throw new Error(
      `Could not find 'default_cards' in catalog. Available types: ${catalog.data.map((d) => d.type).join(", ")}`
    );
  }

  const sizeMb = (entry.size / 1024 / 1024).toFixed(0);
  console.log(`Found: ${entry.name}`);
  console.log(`  Size:         ~${sizeMb} MB`);
  console.log(`  Last updated: ${entry.updated_at}`);
  console.log(`  URL:          ${entry.download_uri}`);

  console.log("\nDownloading... (this takes a minute or two)");

  const dataRes = await fetch(entry.download_uri, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!dataRes.ok) {
    throw new Error(`Download failed with status ${dataRes.status}`);
  }

  const cards = (await dataRes.json()) as RawCard[];
  console.log(`Downloaded ${cards.length.toLocaleString()} card objects`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  // JSON.stringify without indentation keeps the file compact (~300 MB vs ~700 MB pretty-printed)
  await writeFile(OUTPUT_FILE, JSON.stringify(cards));

  const savedMb = (JSON.stringify(cards).length / 1024 / 1024).toFixed(0);
  console.log(`Saved to ${OUTPUT_FILE} (${savedMb} MB)`);

  console.log("\nSample cards:");
  for (const card of cards.slice(0, 5)) {
    console.log(`  - ${card.name} [${card.set_name}]`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
