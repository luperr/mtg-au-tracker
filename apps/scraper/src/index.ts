import cron from "node-cron";
import { importScryfallData } from "./scryfall/bulk-import.js";
import { runAllScrapers } from "./stores/run-all.js";

const SCRYFALL_CRON = process.env.SCRAPE_CRON_SCRYFALL ?? "0 3 * * *";
const STORES_CRON = process.env.SCRAPE_CRON_STORES ?? "0 5 * * *";

console.log("MTG AU Tracker — Scraper Service");
console.log(`  Scryfall import schedule: ${SCRYFALL_CRON}`);
console.log(`  Store scrape schedule:    ${STORES_CRON}`);
console.log("");

// Schedule Scryfall bulk import
cron.schedule(SCRYFALL_CRON, async () => {
  console.log(`[${new Date().toISOString()}] Starting scheduled Scryfall import...`);
  try {
    await importScryfallData();
  } catch (err) {
    console.error("Scheduled Scryfall import failed:", err);
  }
});

// Schedule store scraping
cron.schedule(STORES_CRON, async () => {
  console.log(`[${new Date().toISOString()}] Starting scheduled store scrape...`);
  try {
    await runAllScrapers();
  } catch (err) {
    console.error("Scheduled store scrape failed:", err);
  }
});

// Run initial import on startup if the database is empty
async function checkAndRunInitialImport() {
  const { db, schema } = await import("./lib/db.js");
  const { sql } = await import("drizzle-orm");

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.cards);

  const cardCount = Number(result[0]?.count ?? 0);

  if (cardCount === 0) {
    console.log("Database is empty — running initial Scryfall import...");
    await importScryfallData();
  } else {
    console.log(`Database has ${cardCount.toLocaleString()} cards. Waiting for scheduled runs.`);
  }
}

checkAndRunInitialImport().catch((err) => {
  console.error("Initial import check failed:", err);
});

// Keep the process alive
console.log("Scraper service running. Press Ctrl+C to stop.");
