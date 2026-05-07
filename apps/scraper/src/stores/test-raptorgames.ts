/**
 * Diagnostic tool for the Raptor Games scraper.
 * Shows raw product structure to identify the correct SKU format and
 * understand why Level 0 (set+collector) matching is failing.
 *
 * Run with:
 *   docker compose run --rm scraper pnpm --filter @mtg-au/scraper test:raptorgames
 */

import { ShopifyScraper, parseSkuData, mapProduct } from "./shopify.js";
import { SHOPIFY_STORES } from "./shopify-stores.config.js";

const CONFIG = SHOPIFY_STORES.find((s) => s.id === "raptor_games")!;
const PRINT_LIMIT = 5;

async function main() {
  const scraper = new ShopifyScraper(CONFIG);

  try {
    const url = `${CONFIG.baseUrl}/collections/${CONFIG.collectionHandle}/products.json?limit=5&page=1`;
    const raw = await (scraper as any).fetchJson(url) as { products: any[] };

    if (!raw.products || raw.products.length === 0) {
      console.error("ERROR: No products returned — check collection handle or bot protection");
      process.exit(1);
    }

    console.log(`Fetched ${raw.products.length} products. Raw structure:\n`);

    for (const p of raw.products.slice(0, PRINT_LIMIT)) {
      console.log(`${"─".repeat(80)}`);
      console.log(`title        : ${p.title}`);
      console.log(`handle       : ${p.handle}`);
      console.log(`product_type : ${p.product_type}`);
      console.log(`tags         : [${(p.tags ?? []).slice(0, 6).join(", ")}]`);
      console.log(`options      : ${JSON.stringify((p.options ?? []).map((o: any) => o.name))}`);

      for (const v of (p.variants ?? []).slice(0, 3)) {
        const sku = v.sku ?? "(no sku)";
        const parsed = parseSkuData(sku);
        console.log(
          `  variant  title="${v.title}"  price=${v.price}  avail=${v.available}` +
          `\n           sku="${sku}"` +
          `\n           opt1="${v.option1}"  opt2="${v.option2}"  opt3="${v.option3}"` +
          `\n           parsed → setCode=${parsed.setCode ?? "null"}  collector=${parsed.collectorNumber ?? "null"}  isFoil=${parsed.isFoil}`
        );
      }

      const scraped = mapProduct(p, CONFIG.baseUrl);
      if (scraped.length > 0) {
        const c = scraped[0];
        console.log(
          `  → ScrapedCard: rawName="${c.rawName}"  setCode=${c.setCode ?? "null"}  collector=${c.collectorNumber ?? "null"}  isFoil=${c.isFoil}  setName="${c.setName ?? "null"}"`,
        );
      } else {
        console.log(`  → mapProduct returned [] (filtered out — token/emblem, condition≠NM, or skipped variant)`);
      }
    }

    console.log(`\n${"─".repeat(80)}`);
    console.log("If setCode and collectorNumber above are null, parseSkuData doesn't");
    console.log("recognise this store's SKU format → add a new format case to parseSkuData.");
    console.log("If they are populated but matching still fails, check for leading-zero");
    console.log("mismatch (SKU '001' vs Scryfall '1') or foil flag mismatch.");

  } finally {
    await scraper.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
