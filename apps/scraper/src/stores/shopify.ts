/**
 * Generic Shopify scraper for Australian MTG stores.
 *
 * Any store running Shopify can be added by creating a ShopifyStoreConfig entry
 * in shopify-stores.config.ts — no scraper code changes needed.
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
 *   - Card name: strip common set-suffix patterns from product title.
 *   - Set name: prefer tags starting with "Set:" / "set:", else try title suffix.
 *   - Condition + foil: read from variant option values (option1/option2 keyed by
 *     option axis name). Falls back to splitting variant.title on " / ".
 *   - Stock: variant.available boolean, or fall back to inventory_quantity > 0.
 *   - Only NM variants are emitted (same behaviour as original Good Games scraper).
 */

import { type ScrapedCard, normaliseCondition } from "@mtg-au/shared";
import { BaseScraper } from "./base-scraper.js";
import type { ShopifyStoreConfig } from "./shopify-stores.config.js";
import { logger } from "../lib/logger.js";

const PAGE_SIZE = 250;

// ── Shopify JSON API types ────────────────────────────────────────────────────

interface ShopifyOption {
  name: string;   // e.g. "Condition", "Finish", "Title"
  values: string[];
}

interface ShopifyVariant {
  id: number;
  title: string;          // e.g. "Near Mint / Non-Foil" or "Default Title"
  price: string;          // AUD as decimal string e.g. "4.50"
  sku: string | null;     // e.g. "MOC-381-EN-NF-1" or "MTG-TLA-336-01WREUQWQQ"
  available: boolean;
  inventory_quantity: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  tags: string[];         // May include set names, colours, etc.
  options: ShopifyOption[];
  variants: ShopifyVariant[];
}

interface ProductsResponse {
  products: ShopifyProduct[];
}

// ── Product title parsing ─────────────────────────────────────────────────────
// Strip common set-suffix patterns to get the clean card name.
// Examples:
//   "Lightning Bolt - Magic 2011"  → { cardName: "Lightning Bolt", setName: "Magic 2011" }
//   "Lightning Bolt (M11)"         → { cardName: "Lightning Bolt", setName: "M11" }
//   "Lightning Bolt"               → { cardName: "Lightning Bolt", setName: null }

export function parseProductTitle(title: string): { cardName: string; setName: string | null } {
  // Pattern: "Name - Set Name" (dash separator)
  const dashMatch = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashMatch) {
    return { cardName: dashMatch[1].trim(), setName: dashMatch[2].trim() };
  }

  // Pattern: "Name (Set Name)" or "Name [Set Name]"
  const bracketMatch = title.match(/^(.+?)\s+[\[(]([^\])]*)[\])]$/);
  if (bracketMatch) {
    return { cardName: bracketMatch[1].trim(), setName: bracketMatch[2].trim() };
  }

  return { cardName: title.trim(), setName: null };
}

// ── Set extraction from tags ──────────────────────────────────────────────────
// Shopify stores often put set info in tags like "Set: Dominaria United" or
// "set:dmu" or just the set name. We try multiple conventions.

function extractSetFromTags(tags: string[]): string | null {
  for (const tag of tags) {
    // "Set: Name" or "set:code" prefixed tags
    const prefixed = tag.match(/^set[:\s]+(.+)$/i);
    if (prefixed) return prefixed[1].trim();
  }
  return null;
}

// Gameology encodes foil in tags: "Printing_Non-Foil" or "Printing_Foil".
function extractFoilFromTags(tags: string[]): boolean | null {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (lower === "printing_non-foil" || lower === "printing_nonfoil") return false;
    if (lower === "printing_foil") return true;
  }
  return null;
}

// ── SKU parsing ───────────────────────────────────────────────────────────────
// Two known SKU formats used by AU Shopify MTG stores:
//
// Format A — Good Games / Plenty of Games:
//   {SET}-{COLLECTOR}-{LANG}-{FINISH}-{CONDITION_NUM}
//   e.g. "MOC-381-EN-NF-1", "LTR-123-EN-F-2"
//   FINISH: NF = non-foil; F, FO, FOIL = foil
//
// Format B — Gameology:
//   MTG-{SET}-{COLLECTOR}-{RANDOM_SUFFIX}
//   e.g. "MTG-TLA-336-01WREUQWQQ"
//   Foil is determined from product tags instead.

interface SkuData {
  setCode: string | null;
  collectorNumber: string | null;
  isFoil: boolean | null; // null = could not determine from SKU alone
}

const NON_FOIL_FINISHES = new Set(["NF", "NONFOIL", "NON-FOIL"]);

export function parseSkuData(sku: string | null | undefined): SkuData {
  if (!sku) return { setCode: null, collectorNumber: null, isFoil: null };

  // Format A: SET-COLLECTOR-LANG-FINISH-CONDITION  e.g. "MOC-381-EN-NF-1"
  // Handles DFC collector numbers:  "MH3-244//244-EN-NF-1" (the //NNN part is ignored)
  // Handles letter-suffixed collector numbers: "PTHB-244S-EN-FO-1" (lowercased to "244s")
  const formatA = sku.match(/^([A-Z0-9]{2,6})-(\d{1,4}[a-zA-Z]?)(?:\/\/\d+)?-[A-Z]{2}-([A-Z-]+)-\d+$/i);
  if (formatA) {
    const finish = formatA[3].toUpperCase();
    return {
      setCode: formatA[1].toLowerCase(),
      collectorNumber: formatA[2].toLowerCase(),
      isFoil: !NON_FOIL_FINISHES.has(finish),
    };
  }

  // Format B: MTG-SET-COLLECTOR-RANDOMSUFFIX  e.g. "MTG-TLA-336-01WREUQWQQ"
  const formatB = sku.match(/^MTG-([A-Z0-9]{2,6})-(\d{1,4}[a-z]?)-/i);
  if (formatB) {
    return {
      setCode: formatB[1].toLowerCase(),
      collectorNumber: formatB[2],
      isFoil: null,
    };
  }

  return { setCode: null, collectorNumber: null, isFoil: null };
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

// ── Variant product detection ─────────────────────────────────────────────────
// Some stores include variant type keywords in the product title (e.g. "Quantum
// Riddler Borderless"). Without collector numbers we can't reliably identify
// *which* specific printing in a set this is, so non-borderless variants are
// skipped. Borderless IS handled: we strip the word and pass isBorderless=true
// so the matcher can reverse its sort and prefer the high-collector-number printing.

const SKIP_VARIANT_KEYWORDS = [
  "extended art",
  "showcase",
  "retro frame",
  "retro border",
  "alternate art",
  "full art",
  "surge foil",
  "galaxy foil",
  "gilded foil",
  "rainbow foil",
  "textured foil",
  "etched foil",
  "serialized",
  "step-and-compleat",
  "schematic",
  "anime",
];

// Matches "borderless" as a whole word anywhere in a string (case-insensitive).
const BORDERLESS_WORD = /\bborderless\b/i;

// Collector numbers encoded as zero-padded 4-digit numbers in parentheses, e.g.
// "Spider-Man 2099 (0216)" or "Kaalia of the Vast () (0343)".
const COLLECTOR_NUM_RE = /\((\d{4})\)/;

export function isSkippedVariant(title: string): boolean {
  const lower = title.toLowerCase();
  return SKIP_VARIANT_KEYWORDS.some((kw) => lower.includes(kw));
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

// ── LotR Commander "named land" detection ─────────────────────────────────────
// Some stores list LotR alternative-name cards as e.g.:
//   "Helm's Deep - Shinka, the Bloodsoaked Keep - The LotR: Commander"
// After parseProductTitle this becomes:
//   cardName = "Helm's Deep"
//   setName  = "Shinka, the Bloodsoaked Keep [The LotR: Commander]"
// The real Scryfall card name is the part of setName before the first " [".

function extractLotRStyleName(cardName: string, setName: string | null): { rawName: string; resolvedSetName: string | null } {
  if (!setName) return { rawName: cardName, resolvedSetName: setName };
  const bracketPos = setName.indexOf(" [");
  if (bracketPos === -1) return { rawName: cardName, resolvedSetName: setName };

  const prefix = setName.slice(0, bracketPos).trim();
  const innerSet = setName.slice(bracketPos + 2, setName.lastIndexOf("]")).trim();

  // Only swap if the prefix looks like a card name (has a capital letter, no digits)
  if (prefix.length > 2 && /^[A-Z]/.test(prefix)) {
    return { rawName: prefix, resolvedSetName: innerSet || null };
  }
  return { rawName: cardName, resolvedSetName: setName };
}

// ── Product → ScrapedCard[] ───────────────────────────────────────────────────

function mapProduct(product: ShopifyProduct, baseUrl: string): ScrapedCard[] {
  if (isTokenOrEmblem(product)) return [];

  // Parse set code + collector number + foil from the first variant's SKU.
  // These are more reliable than title parsing and allow us to match special
  // treatments (showcase, extended art, etc.) that would otherwise be skipped.
  const skuData = parseSkuData(product.variants[0]?.sku);
  const hasSkuMatch = skuData.setCode !== null && skuData.collectorNumber !== null;

  // Only skip variant keywords (showcase, extended art, etc.) when we don't
  // have a precise SKU match — without set+collector we can't reliably identify
  // which specific printing it is.
  if (!hasSkuMatch && isSkippedVariant(product.title)) return [];

  // Foil from tags (e.g. Gameology's "Printing_Non-Foil" / "Printing_Foil").
  // Used as fallback when the SKU format doesn't encode finish.
  const tagFoil = extractFoilFromTags(product.tags);

  const isBorderless = BORDERLESS_WORD.test(product.title);

  // Title-based collector number extraction (4-digit zero-padded pattern).
  // Used as fallback when SKU doesn't provide a collector number.
  const collectorMatch = COLLECTOR_NUM_RE.exec(product.title);
  const titleCollectorNumber = collectorMatch ? String(parseInt(collectorMatch[1], 10)) : null;

  const collectorNumber = skuData.collectorNumber ?? titleCollectorNumber;
  const setCode = skuData.setCode;

  // Build a clean title for card name / set name parsing:
  // remove the zero-padded collector number and "Borderless" word.
  let cleanTitle = product.title;
  if (collectorMatch) cleanTitle = cleanTitle.replace(collectorMatch[0], "");
  if (isBorderless) cleanTitle = cleanTitle.replace(BORDERLESS_WORD, "");
  cleanTitle = cleanTitle.replace(/\s{2,}/g, " ").trim();

  const { cardName: parsedCardName, setName: titleSetName } = parseProductTitle(cleanTitle);
  const tagSetName = extractSetFromTags(product.tags);
  const rawSetName = tagSetName ?? titleSetName;

  // Resolve LotR-style "DisplayName - RealCardName [Set]" product titles
  const { rawName: cardName, resolvedSetName: setName } = extractLotRStyleName(parsedCardName, rawSetName);

  const sourceUrl = `${baseUrl}/products/${product.handle}`;
  const results: ScrapedCard[] = [];

  for (const variant of product.variants) {
    const priceNum = parseFloat(variant.price);
    if (isNaN(priceNum) || priceNum <= 0) continue;

    const { condition, isFoil: variantFoil, finish: variantFinish } = parseVariant(variant, product.options);
    if (condition !== "NM") continue;

    // Foil priority: SKU finish field > tag > variant option parsing
    const isFoil = skuData.isFoil ?? tagFoil ?? variantFoil;
    // finish: use etched from variant options if detected; otherwise derive from isFoil
    const finish: "nonfoil" | "foil" | "etched" =
      variantFinish === "etched" ? "etched" : isFoil ? "foil" : "nonfoil";

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
      isBorderless: isBorderless || undefined,
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

  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  private async fetchProductsPage(pageNum: number): Promise<ShopifyProduct[]> {
    const url = `${this.config.baseUrl}/collections/${this.config.collectionHandle}/products.json?limit=${PAGE_SIZE}&page=${pageNum}`;
    try {
      const data = await this.fetchJson<ProductsResponse>(url);
      return data.products ?? [];
    } catch (err: unknown) {
      this.log.warn({ page: pageNum, err: String(err) }, "Failed to fetch products page");
      return [];
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

      if (products.length === 0) {
        this.log.debug({ page }, "No products on page — done");
        break;
      }

      totalProducts += products.length;

      for (const product of products) {
        const cards = mapProduct(product, this.config.baseUrl);
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

    this.log.info({ total_products: totalProducts, total_cards: totalCards }, "Shopify scrape complete");
  }
}
