/**
 * Generic Shopify scraper for Australian MTG stores.
 *
 * Any store running Shopify can be added by creating a registry entry with a
 * `shopify` block in stores.config.ts — no scraper code changes needed.
 *
 * Tested stores:
 *   - Good Games   (tcg.goodgames.com.au)
 *   - Gameology    (gameology.com.au)
 *   - Plenty of Games (plentyofgames.com.au)
 *
 * Strategy:
 *   Paginate /collections/{handle}/products.json?limit=250&page=N until an
 *   empty products array is returned. Each Shopify product has:
 *     - title: The card name (may include set in parentheses or after a dash)
 *     - tags: Array of strings — may include set names, colours, etc.
 *     - options: Named option axes (Condition, Finish / Foil, etc.)
 *     - variants: One per condition+foil combo — each has price + stock status
 *
 * Parsing strategy:
 *   Title parsing is dialect-specific — see title-parsers/. `mapProduct()` picks
 *   a parser based on `config.titleFormat` (default: standard.ts's SKU + title
 *   fallback chain), then builds ScrapedCard variants from the parsed result:
 *     - Condition + foil: read from variant option values (option1/option2 keyed by
 *       option axis name). Falls back to splitting variant.title on " / ".
 *     - Stock: variant.available boolean, or fall back to inventory_quantity > 0.
 *     - Only NM variants are emitted (same behaviour as original Good Games scraper).
 */

import { type ScrapedCard, normaliseCondition, extractTreatment } from "@mtg-au/shared";
import { BaseScraper } from "./base-scraper.js";
import type { ShopifyStoreConfig } from "./stores.config.js";
import type { ShopifyOption, ShopifyProduct, ShopifyVariant, ProductsResponse } from "./shopify-types.js";
import { parseSkuData } from "./sku-parser.js";
import { parseStandardTitle } from "./title-parsers/standard.js";
import { parseAllInTitleFormat } from "./title-parsers/all-in-title.js";
import { logger } from "../lib/logger.js";

export { parseProductTitle, isSkippedVariant } from "./title-parsers/standard.js";
export { parseSkuData } from "./sku-parser.js";

const PAGE_SIZE = 250;

// Gameology encodes foil in tags: "Printing_Non-Foil" or "Printing_Foil".
// Mega Games (and others) use plain "Foil" / "Non-Foil" tags.
//
// TODO(future-store): plain "Foil" tag is safe here only because every store that
// uses it (Good Games, Ronin, Plenty of Games) also has Format A SKUs, so skuFoil
// is always non-null and tagFoil is never reached in the ?? chain.  If a future
// store has (a) no/null-foil SKU AND (b) uses "Foil" as a catalog-wide tag (not
// a per-product indicator), it will be mis-classified.  Gate with a config flag
// (e.g. trustFoilTag: true) if that ever happens.
function extractFoilFromTags(tags: string[]): boolean | null {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (lower === "printing_non-foil" || lower === "printing_nonfoil" || lower === "non-foil" || lower === "nonfoil") return false;
    if (lower === "printing_foil" || lower === "foil") return true;
  }
  return null;
}

// ── Variant option parsing ────────────────────────────────────────────────────
// Map option axes by name to find which optionN slot holds Condition / Foil.
// Falls back to splitting variant.title on " / " if no named axes match.

interface ParsedVariant {
  condition: string;
  isFoil: boolean;
  finish: "nonfoil" | "foil" | "etched";
}

const FOIL_KEYWORDS = ["foil", "etched foil", "galaxy foil", "gilded foil", "surge foil", "rainbow foil", "textured foil"];
const NON_FOIL_KEYWORDS = ["non-foil", "nonfoil", "non foil", "regular"];
const CONDITION_AXES = ["condition", "conditions"];
const FOIL_AXES = ["finish", "foil", "treatment", "printing"];

function parseVariant(variant: ShopifyVariant, options: ShopifyOption[]): ParsedVariant {
  // Build a name→optionN value map for this variant
  const optionValues: Record<string, string> = {};
  const slots: Array<string | null> = [variant.option1, variant.option2, variant.option3];
  for (let i = 0; i < options.length; i++) {
    const axisName = options[i].name.toLowerCase();
    const value = slots[i];
    if (value) optionValues[axisName] = value;
  }

  // Find condition from recognised axis names
  let conditionRaw = "";
  for (const axis of CONDITION_AXES) {
    if (optionValues[axis]) {
      conditionRaw = optionValues[axis];
      break;
    }
  }

  // Find foil status from recognised axis names
  let foilRaw = "";
  for (const axis of FOIL_AXES) {
    if (optionValues[axis]) {
      foilRaw = optionValues[axis].toLowerCase();
      break;
    }
  }

  // If no named axes matched (e.g. only axis is "Title"), try splitting variant.title.
  // Shopify's own "Default Title" / "Default" means a single-variant product with no
  // condition options — treat it as NM non-foil (condition is implied by the listing).
  if (!conditionRaw && !foilRaw) {
    if (variant.title === "Default Title" || variant.title === "Default") {
      return { condition: "NM", isFoil: false, finish: "nonfoil" };
    }
    const parts = variant.title.split(/\s*\/\s*/);
    if (parts.length >= 1) conditionRaw = parts[0];
    if (parts.length >= 2) foilRaw = parts[1].toLowerCase();
  }

  // Some stores encode foil in the condition string: "Near Mint Foil"
  // Strip the foil suffix and treat as isFoil=true
  const foilSuffix = /\s+foil$/i;
  let foilFromCondition = false;
  if (foilSuffix.test(conditionRaw)) {
    conditionRaw = conditionRaw.replace(foilSuffix, "").trim();
    foilFromCondition = true;
  }

  // If still nothing, default to NM non-foil and let downstream matching handle it
  const condition = conditionRaw ? normaliseCondition(conditionRaw) : "NM";
  const isFoil = foilFromCondition || (foilRaw
    ? FOIL_KEYWORDS.some((k) => foilRaw.includes(k)) && !NON_FOIL_KEYWORDS.some((k) => foilRaw.includes(k))
    : false);
  const finish: "nonfoil" | "foil" | "etched" =
    isFoil && foilRaw.includes("etched") ? "etched" : isFoil ? "foil" : "nonfoil";

  return { condition, isFoil, finish };
}

// ── Stock check ───────────────────────────────────────────────────────────────
// Shopify `available` is the most reliable field; fall back to inventory_quantity.

function isInStock(variant: ShopifyVariant): boolean {
  if (typeof variant.available === "boolean") return variant.available;
  return variant.inventory_quantity > 0;
}

// Tokens, emblems, and double-faced tokens are not in our printings DB.
// Note: we do NOT reject on "//" — DFC cards (e.g. "Delver of Secrets // Insectile Aberration")
// legitimately contain "//" in their title. Double-faced tokens are caught by the \btoken\b check.
export function isTokenOrEmblem(product: ShopifyProduct): boolean {
  const lower = product.title.toLowerCase();
  if (/\btoken\b/.test(lower)) return true;
  if (/\bemblem\b/.test(lower)) return true;
  if (product.product_type.toLowerCase() === "token") return true;
  return false;
}

// ── Product → ScrapedCard[] ───────────────────────────────────────────────────

export function mapProduct(product: ShopifyProduct, config: ShopifyStoreConfig): ScrapedCard[] {
  const baseUrl = config.baseUrl;
  if (isTokenOrEmblem(product)) return [];

  let cardName: string;
  let collectorNumber: string | null;
  let setName: string | null;
  let setCode: string | null = null;
  let titleFoil: boolean | null = null; // non-null overrides variant foil detection
  let skuFoil: boolean | null = null;

  if (config.titleFormat === "all-in-title") {
    const parsed = parseAllInTitleFormat(product);
    cardName = parsed.cardName;
    collectorNumber = parsed.collectorNumber;
    setName = parsed.setName;
    titleFoil = parsed.titleFoil;
  } else {
    const parsed = parseStandardTitle(product);
    if (parsed === null) return [];
    cardName = parsed.cardName;
    setCode = parsed.setCode;
    collectorNumber = parsed.collectorNumber;
    setName = parsed.setName;
    skuFoil = parsed.skuFoil;
  }

  const tagFoil = extractFoilFromTags(product.tags);
  const treatment = extractTreatment(product.title);

  const sourceUrl = `${baseUrl}/products/${product.handle}`;
  const results: ScrapedCard[] = [];

  // Location-variant stores (e.g. GUF) encode store branches as variants instead
  // of condition/foil. Collapse each unique foil type into one entry; condition is
  // implied NM; inStock = true if any branch has stock.
  if (config.locationVariants) {
    type FinishKey = "nonfoil" | "foil" | "etched";
    const groups = new Map<FinishKey, { price: string; inStock: boolean }>();
    for (const variant of product.variants) {
      const priceNum = parseFloat(variant.price);
      if (isNaN(priceNum) || priceNum <= 0) continue;
      const skuData = parseSkuData(variant.sku);
      const isFoil = skuData.isFoil ?? /\bfoil\b/i.test(variant.title);
      const isEtched = /\betched\b/i.test(variant.title);
      const finishKey: FinishKey = isEtched ? "etched" : isFoil ? "foil" : "nonfoil";
      const existing = groups.get(finishKey);
      if (!existing) {
        groups.set(finishKey, { price: variant.price, inStock: variant.available });
      } else if (!existing.inStock && variant.available) {
        existing.inStock = true;
      }
    }
    for (const [finishKey, { price, inStock }] of groups) {
      results.push({
        rawName: cardName,
        setCode,
        setName,
        collectorNumber,
        price,
        priceType: "sell",
        condition: "NM",
        isFoil: finishKey !== "nonfoil",
        finish: finishKey,
        treatment,
        inStock,
        sourceUrl,
      });
    }
    return results;
  }

  for (const variant of product.variants) {
    const priceNum = parseFloat(variant.price);
    if (isNaN(priceNum) || priceNum <= 0) continue;

    const { condition, isFoil: variantFoil, finish: variantFinish } = parseVariant(variant, product.options);
    if (condition !== "NM") continue;

    const isFoil = titleFoil ?? (skuFoil ?? tagFoil ?? variantFoil);
    // For all-in-title stores, etched finish is declared in the title via
    // "(Foil Etched)" treatment rather than a variant option.
    const titleEtched = config.titleFormat === "all-in-title" &&
      /\bFoil\s+Etched\b|\bEtched\s+Foil\b/i.test(product.title);
    const finish: "nonfoil" | "foil" | "etched" =
      titleEtched ? "etched" : (variantFinish === "etched" ? "etched" : isFoil ? "foil" : "nonfoil");

    results.push({
      rawName: cardName,
      setCode,
      setName,
      collectorNumber,
      price: priceNum.toFixed(2),
      priceType: "sell",
      condition,
      isFoil,
      finish,
      treatment,
      inStock: isInStock(variant),
      sourceUrl,
    });
  }

  return results;
}

// ── Scraper class ─────────────────────────────────────────────────────────────

export class ShopifyScraper extends BaseScraper {
  private readonly log;

  constructor(private config: ShopifyStoreConfig) {
    super();
    this.log = logger.child({ component: "shopify", store: config.id });
  }

  /**
   * Fetch one page of the collection. Returns null when the request failed, as
   * distinct from an empty page — the two are indistinguishable to a paginating
   * caller but mean opposite things: "the catalogue ends here" vs "we have no
   * idea what's here". Swallowing the failure into [] silently truncated stores
   * mid-run, after runStore had already deleted their prices.
   */
  private async fetchProductsPage(pageNum: number): Promise<ShopifyProduct[] | null> {
    const url = `${this.config.baseUrl}/collections/${this.config.collectionHandle}/products.json?limit=${PAGE_SIZE}&page=${pageNum}`;
    try {
      const data = await this.fetchJson<ProductsResponse>(url);
      return data.products ?? [];
    } catch (err: unknown) {
      this.log.warn({ page: pageNum, err: String(err) }, "Failed to fetch products page");
      return null;
    }
  }

  async *scrapeAll(): AsyncGenerator<ScrapedCard> {
    this.log.info("Starting Shopify scrape");

    let page = 1;
    let totalProducts = 0;
    let totalCards = 0;

    while (true) {
      this.log.debug({ page }, "Fetching products page");
      const products = await this.fetchProductsPage(page);

      // BaseScraper has already retried transient failures by this point, so a
      // null here is a real outage. Fail the store loudly rather than reporting
      // however much of the catalogue we happened to get before it broke.
      if (products === null) {
        throw new Error(
          `${this.config.id}: products page ${page} could not be fetched — aborting rather than reporting a partial catalogue`,
        );
      }

      if (products.length === 0) {
        this.log.debug({ page }, "No products on page — done");
        break;
      }

      totalProducts += products.length;

      for (const product of products) {
        const cards = mapProduct(product, this.config);
        totalCards += cards.length;
        for (const card of cards) {
          yield card;
        }
      }

      this.log.debug({ page, products: products.length, total_cards: totalCards }, "Page fetched");

      if (products.length < PAGE_SIZE) {
        // Last page — no need to fetch another
        break;
      }

      page++;
    }

    if (totalProducts === 0) {
      this.log.error(
        { store: this.config.id, likely_cause: "endpoint_404_or_empty_collection" },
        "Store returned zero products — check collection handle or store availability",
      );
    } else if (totalCards === 0) {
      this.log.error(
        { store: this.config.id, total_products: totalProducts, likely_cause: "handle_returns_wrong_product_type" },
        "Store returned products but zero cards were parsed — collection handle may point to wrong product type",
      );
    }

    this.log.info({ total_products: totalProducts, total_cards: totalCards }, "Shopify scrape complete");
  }
}
