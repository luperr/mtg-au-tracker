/**
 * Generic Shopify scraper for Australian MTG stores.
 *
 * Any store running Shopify can be added by creating a registry entry with a
 * `shopify` block in stores.config.ts — no scraper code changes needed.
 *
 * Drives 35 AU stores — see shopifyStores() in stores.config.ts for the live list.
 *
 * Strategy:
 *   Cursor-walk the Storefront GraphQL API — see shopify-graphql.ts for why
 *   products.json can no longer be used. `scrapeAll()` picks the most precise
 *   source a store's catalogue size allows, falling back only when Shopify's own
 *   25,000-item pagination limit says it must. Each product arrives in the same
 *   shape the REST endpoint returned:
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
 *     - Only NM variants are emitted.
 */

import { type ScrapedCard, normaliseCondition, extractTreatment } from "@mtg-au/shared";
import { BaseScraper } from "./base-scraper.js";
import type { ShopifyStoreConfig } from "./stores.config.js";
import type { ShopifyOption, ShopifyProduct, ShopifyVariant, DialectTitleResult } from "./shopify-types.js";
import {
  COLLECTION_QUERY,
  PRODUCTS_QUERY,
  PRODUCT_TYPE_QUERY,
  GRAPHQL_PAGE_SIZE,
  GRAPHQL_VARIANT_LIMIT,
  PAGINATION_LIMIT,
  PaginationLimitError,
  buildProductQuery,
  dominantProductType,
  parseCollectionPage,
  parseProductsPage,
  storefrontUrl,
  type CollectionResponse,
  type GraphQLProductsPage,
  type ProductTypeResponse,
  type StorefrontResponse,
} from "./shopify-graphql.js";
import { parseSkuData } from "./sku-parser.js";
import { parseStandardTitle } from "./title-parsers/standard.js";
import { parseAllInTitleFormat } from "./title-parsers/all-in-title.js";
import { parseParenSetCodeTitle } from "./title-parsers/paren-set-code.js";
import { parseFlagPrefixTitle } from "./title-parsers/flag-prefix.js";
import { parseTrailingSetParenTitle } from "./title-parsers/trailing-set-paren.js";
import { logger } from "../lib/logger.js";

export { parseProductTitle, isSkippedVariant } from "./title-parsers/standard.js";
export { parseSkuData } from "./sku-parser.js";

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
  let titleFinish: DialectTitleResult["titleFinish"] = null;
  let dialectTreatment: string | null = null;
  let skuFoil: boolean | null = null;

  let dialect: DialectTitleResult | null = null;
  if (config.titleFormat === "paren-set-code") {
    dialect = parseParenSetCodeTitle(product);
  } else if (config.titleFormat === "trailing-set-paren") {
    dialect = parseTrailingSetParenTitle(product);
  } else if (config.titleFormat === "flag-prefix") {
    // This dialect alone can reject a listing — playsets are priced per 4 cards.
    dialect = parseFlagPrefixTitle(product);
    if (dialect === null) return [];
  }

  if (dialect) {
    cardName = dialect.cardName;
    setCode = dialect.setCode;
    setName = dialect.setName;
    collectorNumber = dialect.collectorNumber;
    titleFoil = dialect.titleFoil;
    titleFinish = dialect.titleFinish;
    dialectTreatment = dialect.treatment;
  } else if (config.titleFormat === "all-in-title") {
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
  const treatment = dialectTreatment ?? extractTreatment(product.title);

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
      titleFinish ?? (titleEtched ? "etched" : (variantFinish === "etched" ? "etched" : isFoil ? "foil" : "nonfoil"));

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

  // Running totals for one scrapeAll(), reset at the start of each run so a
  // reused instance doesn't report the previous run's figures.
  private totalProducts = 0;
  private totalCards = 0;
  private truncatedVariants = 0;
  private requests = 0;
  /** Creation date of the last product seen, for resuming past the limit. */
  private lastCreatedAt: number | null = null;
  /**
   * Product ids already yielded this run.
   *
   * Each fallback tier re-walks products the previous tier already emitted
   * before it discovered it had overflowed, and a store that changes underneath
   * a multi-window walk can return one twice. A duplicate here becomes a
   * duplicate row in store_prices, which has no unique constraint to catch it.
   */
  private readonly seen = new Set<number>();

  /**
   * Which productType identifies this store's singles.
   *
   * Discovered once per run from the store's existing collectionHandle rather
   * than configured per store: the value differs across stores ("MTG Single",
   * "Single Cards", "TCG Singles") and the collection already names exactly the
   * products we want.
   */
  private async detectProductType(): Promise<string> {
    const response = await this.postJson<ProductTypeResponse>(storefrontUrl(this.config.baseUrl), {
      query: PRODUCT_TYPE_QUERY,
      variables: { handle: this.config.collectionHandle, pageSize: GRAPHQL_PAGE_SIZE },
    });
    this.requests++;
    return dominantProductType(response, this.config.collectionHandle);
  }

  /** Fetch one cursor page. Throws — see shopify-graphql.ts on why not null. */
  private async fetchProducts(query: string, cursor: string | null): Promise<GraphQLProductsPage> {
    const response = await this.postJson<StorefrontResponse>(storefrontUrl(this.config.baseUrl), {
      query: PRODUCTS_QUERY,
      variables: { query, cursor, pageSize: GRAPHQL_PAGE_SIZE, variantLimit: GRAPHQL_VARIANT_LIMIT },
    });
    this.requests++;
    return parseProductsPage(response, query);
  }

  /**
   * Scrape a store, preferring the most precise source that fits.
   *
   *   1. The collection itself — names exactly the products we want, and keeps
   *      out-of-stock listings, so it is a like-for-like replacement for the old
   *      REST path. Works until the collection passes 25,000 items.
   *   2. The top-level query filtered by productType and in-stock — the only
   *      thing that can read a larger catalogue, at the cost of approximating
   *      "MTG single" by product type.
   *   3. The same, partitioned by creation date, when even that exceeds 25,000.
   *
   * Each fallback is triggered by Shopify's own pagination-limit error rather
   * than a configured threshold, so a store moves between tiers on its own as
   * its catalogue grows.
   */
  async *scrapeAll(): AsyncGenerator<ScrapedCard> {
    this.totalProducts = 0;
    this.totalCards = 0;
    this.truncatedVariants = 0;
    this.requests = 0;
    this.lastCreatedAt = null;
    this.seen.clear();

    try {
      this.log.info({ api: "storefront-collection" }, "Starting Shopify scrape");
      yield* this.walkCollection();
      this.reportRunHealth("collection");
      return;
    } catch (err) {
      if (!(err instanceof PaginationLimitError)) throw err;
      this.log.info(
        { limit: PAGINATION_LIMIT },
        "Collection exceeds the pagination limit — falling back to the product-type query",
      );
    }

    // The collection walk got through 25,000 products before it hit the wall.
    // Those are real listings and are kept — they stay in `seen` so the wider
    // query below doesn't re-yield them as duplicate rows. A large store
    // therefore ends up with the union: that first slice, including its
    // out-of-stock listings, plus every in-stock product found below.
    const productType = await this.detectProductType();
    this.log.info({ api: "storefront-products", product_type: productType }, "Scraping by product type");

    yield* this.walkByCreationDate(productType);

    this.reportRunHealth("product-type");
  }

  /**
   * Walk the in-stock catalogue in creation-date order, resuming past the
   * pagination limit.
   *
   * PRODUCTS_QUERY sorts by `created_at`, so when a window hits the 25,000-item
   * ceiling the last product seen is a watermark: the next window asks for
   * `created_at >= watermark` and carries on. That is one wasted request per
   * window rather than the repeated full-window probing a bisecting search
   * needs — and bisection searches badly here anyway, because catalogues cluster
   * in recent dates, so a midpoint split spends many rounds on empty halves.
   *
   * `>=` rather than `>` so products sharing the watermark second are not
   * skipped; `seen` absorbs the resulting overlap.
   */
  private async *walkByCreationDate(productType: string): AsyncGenerator<ScrapedCard> {
    let since: number | null = null;
    let window = 0;

    while (true) {
      window++;
      this.lastCreatedAt = null;
      try {
        yield* this.walkQuery(buildProductQuery(productType, since));
        return;
      } catch (err) {
        if (!(err instanceof PaginationLimitError)) throw err;

        const watermark = this.lastCreatedAt;
        // No watermark, or one that hasn't moved, means the next window would
        // repeat this one forever. That implies >25,000 in-stock products share
        // a single creation second, which no query can page through.
        if (watermark === null || (since !== null && watermark <= since)) {
          throw new Error(
            `${this.config.id}: cannot page past the ${PAGINATION_LIMIT}-item limit — ` +
              `creation-date watermark did not advance past ` +
              `${since === null ? "the start" : new Date(since).toISOString()}`,
          );
        }

        this.log.info(
          { window, resume_from: new Date(watermark).toISOString() },
          "Window hit the pagination limit — resuming from the last creation date",
        );
        since = watermark;
      }
    }
  }

  /** Cursor-walk the configured collection, yielding cards as they arrive. */
  private async *walkCollection(): AsyncGenerator<ScrapedCard> {
    let cursor: string | null = null;
    let page = 0;

    while (true) {
      page++;
      const response = await this.postJson<CollectionResponse>(storefrontUrl(this.config.baseUrl), {
        query: COLLECTION_QUERY,
        variables: {
          handle: this.config.collectionHandle,
          cursor,
          pageSize: GRAPHQL_PAGE_SIZE,
          variantLimit: GRAPHQL_VARIANT_LIMIT,
        },
      });
      this.requests++;
      const result = parseCollectionPage(response, this.config.collectionHandle);

      yield* this.emit(result);

      if (!result.hasNextPage) break;
      if (result.cursor === null) {
        throw new Error(
          `${this.config.id}: collection reported more pages but returned no cursor at page ${page}`,
        );
      }
      cursor = result.cursor;
    }
  }

  /** Cursor-paginate one query to exhaustion, yielding cards as they arrive. */
  private async *walkQuery(query: string): AsyncGenerator<ScrapedCard> {
    let cursor: string | null = null;
    let page = 0;

    while (true) {
      page++;
      const result: GraphQLProductsPage = await this.fetchProducts(query, cursor);

      yield* this.emit(result);

      if (!result.hasNextPage) break;

      // hasNextPage is true but there is no cursor to advance with: continuing
      // would refetch page 1 forever. Bail loudly instead of looping.
      if (result.cursor === null) {
        throw new Error(
          `${this.config.id}: Storefront API reported more pages but returned no cursor at page ${page} of "${query}"`,
        );
      }
      cursor = result.cursor;
    }

    this.log.debug({ query, pages: page, total_products: this.totalProducts }, "Query walked");
  }

  /** Map one page to cards, skipping products already emitted this run. */
  private *emit(result: GraphQLProductsPage): Generator<ScrapedCard> {
    this.truncatedVariants += result.truncatedVariantProducts;
    // Recorded even for products skipped as duplicates: the watermark tracks how
    // far the sorted walk reached, not how much of it was new.
    if (result.lastCreatedAt !== null) this.lastCreatedAt = result.lastCreatedAt;

    for (const product of result.products) {
      if (this.seen.has(product.id)) continue;
      this.seen.add(product.id);
      this.totalProducts++;

      const cards = mapProduct(product, this.config);
      this.totalCards += cards.length;
      for (const card of cards) {
        yield card;
      }
    }
  }

  private reportRunHealth(source: "collection" | "product-type"): void {
    if (this.truncatedVariants > 0) {
      this.log.warn(
        { products: this.truncatedVariants, variant_limit: GRAPHQL_VARIANT_LIMIT },
        "Some products have more variants than we request — raise GRAPHQL_VARIANT_LIMIT",
      );
    }

    if (this.totalProducts === 0) {
      this.log.error(
        { store: this.config.id, likely_cause: "empty_collection_or_bad_product_type" },
        "Store returned zero products — check collection handle or store availability",
      );
    } else if (this.totalCards === 0) {
      this.log.error(
        { store: this.config.id, total_products: this.totalProducts, likely_cause: "handle_returns_wrong_product_type" },
        "Store returned products but zero cards were parsed — collection handle may point to wrong product type",
      );
    }

    this.log.info(
      {
        total_products: this.totalProducts,
        total_cards: this.totalCards,
        requests: this.requests,
        source,
      },
      "Shopify scrape complete",
    );
  }
}
