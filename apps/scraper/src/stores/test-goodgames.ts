/**
 * Smoke test for the Good Games scraper.
 * Verifies: Shopify API access, pagination, product parsing.
 *
 * Run with:
 *   docker compose run --rm dev pnpm --filter @mtg-au/scraper test:goodgames
 */

import { GoodGamesScraper } from "./goodgames.js";

const BASE_URL = "https://tcg.goodgames.com.au";
const PRINT_LIMIT = 20;
// Only fetch the first page to keep the smoke test fast
const MAX_CARDS = 250;

async function main() {
  const scraper = new GoodGamesScraper();

  try {
    // 1. Health check
    process.stdout.write("Health check... ");
    const healthy = await scraper.healthCheck();
    console.log(healthy ? "OK" : "FAILED (continuing anyway)");

    // 2. Fetch first page of Shopify products.json directly
    console.log(`\nFetching first page of products from ${BASE_URL}...`);
    const url = `${BASE_URL}/collections/mtg-singles-all-products/products.json?limit=5&page=1`;
    const raw = await (scraper as any).fetchJson(url) as { products: any[] };

    if (!raw.products || raw.products.length === 0) {
      console.error("ERROR: No products returned from Shopify API");
      process.exit(1);
    }

    console.log(`\nRaw product sample (first product):`);
    const sample = raw.products[0];
    console.log(`  title: ${sample.title}`);
    console.log(`  handle: ${sample.handle}`);
    console.log(`  product_type: ${sample.product_type}`);
    console.log(`  tags: [${sample.tags?.slice(0, 5).join(", ")}...]`);
    console.log(`  options: ${JSON.stringify(sample.options?.map((o: any) => o.name))}`);
    console.log(`  variants (${sample.variants?.length}):`);
    for (const v of (sample.variants ?? []).slice(0, 3)) {
      console.log(`    title="${v.title}"  price=${v.price}  available=${v.available}  qty=${v.inventory_quantity}  opt1="${v.option1}"  opt2="${v.option2}"`);
    }

    // 3. Run the async generator for up to MAX_CARDS entries
    console.log(`\nRunning scrapeAll() (stopping after ${MAX_CARDS} cards)...`);
    const cards: any[] = [];
    for await (const card of scraper.scrapeAll()) {
      cards.push(card);
      if (cards.length >= MAX_CARDS) break;
    }

    console.log(`\nScraped ${cards.length} ScrapedCard entries. First ${Math.min(PRINT_LIMIT, cards.length)}:\n`);
    for (const card of cards.slice(0, PRINT_LIMIT)) {
      const foil = card.isFoil ? "FOIL" : "    ";
      const stock = card.inStock ? "IN " : "OUT";
      console.log(
        `  ${String(card.rawName).padEnd(45)} ${foil}  ${String(card.condition).padEnd(3)}  $${card.price.padStart(7)}  [${card.setName ?? "?"}]  ${stock}`,
      );
    }

    if (cards.length === 0) {
      console.error("\nERROR: No ScrapedCard objects were yielded");
      process.exit(1);
    }

    // 4. Sanity checks
    const withSet = cards.filter((c) => c.setName).length;
    const foilCount = cards.filter((c) => c.isFoil).length;
    const inStockCount = cards.filter((c) => c.inStock).length;
    console.log(`\nSummary:`);
    console.log(`  Cards with set name : ${withSet}/${cards.length}`);
    console.log(`  Foil variants       : ${foilCount}`);
    console.log(`  In stock            : ${inStockCount}`);

  } finally {
    await scraper.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
