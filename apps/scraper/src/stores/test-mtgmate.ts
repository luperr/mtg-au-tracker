/**
 * Smoke test for the MTG Mate scraper.
 * Verifies: set listing, dataUrl parsing, card data fetching.
 *
 * Run with:
 *   docker compose run --rm dev pnpm --filter @mtg-au/scraper test:mtgmate
 */

import * as cheerio from "cheerio";
import { MtgMateScraper } from "./mtgmate.js";

const TEST_SET_URL = "https://www.mtgmate.com.au/magic_sets/ecl";
const BASE_URL = "https://www.mtgmate.com.au";
const PRINT_LIMIT = 20;

async function main() {
  const scraper = new MtgMateScraper();

  try {
    // 1. Health check
    process.stdout.write("Health check... ");
    const healthy = await scraper.healthCheck();
    console.log(healthy ? "OK" : "FAILED (continuing anyway)");

    // 2. Set listing — set codes are embedded in the page HTML as "magic_sets/{code}" paths
    console.log("\nFetching /magic_sets...");
    const setsHtml = await (scraper as any).fetchPage(`${BASE_URL}/magic_sets`);
    const uniqueSets = [...new Set(
      [...setsHtml.matchAll(/magic_sets\/([a-z0-9]+)/g)].map((m: RegExpExecArray) => m[1])
    )];
    console.log(`Found ${uniqueSets.length} set codes. First 10: ${uniqueSets.slice(0, 10).join(", ")}`);

    if (uniqueSets.length === 0) {
      console.error("ERROR: No set codes found on /magic_sets");
      process.exit(1);
    }

    // 3. Fetch set page and extract dataUrl
    console.log(`\nFetching set page: ${TEST_SET_URL}`);
    const setHtml = await (scraper as any).fetchPage(TEST_SET_URL);
    const $set = cheerio.load(setHtml);
    const rawProps = $set('[data-react-class="FilterableTableLoaded"]').attr("data-react-props");

    if (!rawProps) {
      console.error("ERROR: FilterableTableLoaded data-react-props not found");
      process.exit(1);
    }

    const props = JSON.parse(rawProps);
    console.log("dataUrl:", props.dataUrl);

    // 4. Fetch the card data JSON
    const dataUrl = props.dataUrl.startsWith("http")
      ? props.dataUrl
      : `${BASE_URL}${props.dataUrl}`;

    console.log(`\nFetching card data from: ${dataUrl}`);
    const data = await (scraper as any).fetchJson(dataUrl) as { uuid_data: Record<string, any> };

    const entries = Object.values(data.uuid_data);
    console.log(`Total cards: ${entries.length}`);

    if (entries.length === 0) {
      console.error("ERROR: Card map is empty");
      process.exit(1);
    }

    console.log(`\nFirst ${Math.min(PRINT_LIMIT, entries.length)} cards:\n`);
    for (const entry of entries.slice(0, PRINT_LIMIT)) {
      const price = `$${(entry.price / 100).toFixed(2)}`;
      const stock = entry.quantity > 0 ? `qty:${entry.quantity}` : "OUT";
      console.log(
        `  ${String(entry.name).padEnd(50)} ${String(entry.finish).padEnd(8)} ${price.padStart(7)}  ${stock}  [${entry.set_code}]`,
      );
    }
  } finally {
    await scraper.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
