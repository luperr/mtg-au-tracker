/**
 * Good Games scraper — https://tcg.goodgames.com.au
 *
 * Good Games runs a Shopify TCG store at tcg.goodgames.com.au (not the main
 * goodgames.com.au domain). We hit the Shopify products.json API through
 * Playwright so Cloudflare challenges are handled automatically.
 *
 * Strategy:
 *   Paginate /collections/mtg-singles-all-products/products.json?limit=250&page=N
 *   until an empty products array is returned. Each Shopify product has:
 *     - title: The card name (may include set in parentheses)
 *     - tags: Array of strings — includes set name/code, colours, etc.
 *     - options: Named option axes (Condition, Finish / Foil, etc.)
 *     - variants: One per condition+foil combo — each has price + stock count
 *
 * Parsing strategy:
 *   - Card name: strip common set-suffix patterns from product title.
 *   - Set name: prefer tags starting with "Set:" / "set:", else try title suffix.
 *   - Condition + foil: read from variant option values (option1/option2 keyed by
 *     option axis name). Falls back to splitting variant.title on " / ".
 *   - Stock: variant.inventory_quantity > 0, or variant.available = true.
 *
 * Debugging:
 *   Run `pnpm --filter @mtg-au/scraper test:goodgames` to execute a smoke test
 *   that prints the first page of parsed ScrapedCard objects.
 */

import type { ScrapedCard } from "@mtg-au/shared";
import { BaseScraper } from "./base-scraper.js";

const BASE_URL = "https://tcg.goodgames.com.au";
const COLLECTION = "mtg-singles-all-products";
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

// ── Condition normalisation ───────────────────────────────────────────────────

function normaliseCondition(raw: string): string {
  switch (raw.toLowerCase().trim()) {
    case "near mint":
    case "nm":
    case "mint":
    case "m":
      return "NM";
    case "lightly played":
    case "light played":
    case "lp":
    case "excellent":
    case "ex":
      return "LP";
    case "moderately played":
    case "moderate played":
    case "mp":
    case "good":
    case "gd":
      return "MP";
    case "heavily played":
    case "heavy played":
    case "hp":
    case "played":
      return "HP";
    case "damaged":
    case "dmg":
    case "poor":
      return "DMG";
    default:
      return raw.trim();
  }
}

// ── Product title parsing ─────────────────────────────────────────────────────
// Strip common set-suffix patterns to get the clean card name.
// Examples:
//   "Lightning Bolt - Magic 2011"  → { cardName: "Lightning Bolt", setName: "Magic 2011" }
//   "Lightning Bolt (M11)"         → { cardName: "Lightning Bolt", setName: "M11" }
//   "Lightning Bolt"               → { cardName: "Lightning Bolt", setName: null }

function parseProductTitle(title: string): { cardName: string; setName: string | null } {
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

// ── Variant option parsing ────────────────────────────────────────────────────
// Map option axes by name to find which optionN slot holds Condition / Foil.
// Falls back to splitting variant.title on " / " if no named axes match.

interface ParsedVariant {
  condition: string;
  isFoil: boolean;
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

  // If no named axes matched (e.g. only axis is "Title"), try splitting variant.title
  if (!conditionRaw && !foilRaw && variant.title !== "Default Title") {
    const parts = variant.title.split(/\s*\/\s*/);
    if (parts.length >= 1) conditionRaw = parts[0];
    if (parts.length >= 2) foilRaw = parts[1].toLowerCase();
  }

  // Good Games sometimes encodes foil in the condition string: "Near Mint Foil"
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

  return { condition, isFoil };
}

// ── Stock check ───────────────────────────────────────────────────────────────
// Shopify `available` is the most reliable field; fall back to inventory_quantity.

function isInStock(variant: ShopifyVariant): boolean {
  if (typeof variant.available === "boolean") return variant.available;
  return variant.inventory_quantity > 0;
}

// ── Product → ScrapedCard[] ───────────────────────────────────────────────────

function mapProduct(product: ShopifyProduct): ScrapedCard[] {
  const { cardName, setName: titleSetName } = parseProductTitle(product.title);
  const tagSetName = extractSetFromTags(product.tags);
  const setName = tagSetName ?? titleSetName;

  const sourceUrl = `${BASE_URL}/products/${product.handle}`;
  const results: ScrapedCard[] = [];

  for (const variant of product.variants) {
    const priceNum = parseFloat(variant.price);
    if (isNaN(priceNum) || priceNum <= 0) continue;

    const { condition, isFoil } = parseVariant(variant, product.options);

    results.push({
      rawName: cardName,
      setCode: null,       // Good Games doesn't expose Scryfall set codes
      setName,
      collectorNumber: null, // Not available from Shopify product listings
      price: priceNum.toFixed(2),
      priceType: "sell",
      condition,
      isFoil,
      inStock: isInStock(variant),
      sourceUrl,
    });
  }

  return results;
}

// ── Scraper class ─────────────────────────────────────────────────────────────

export class GoodGamesScraper extends BaseScraper {
  getBaseUrl(): string {
    return BASE_URL;
  }

  private async fetchPage(pageNum: number): Promise<ShopifyProduct[]> {
    const url = `${BASE_URL}/collections/${COLLECTION}/products.json?limit=${PAGE_SIZE}&page=${pageNum}`;
    try {
      const data = await this.fetchJson<ProductsResponse>(url);
      return data.products ?? [];
    } catch (err: unknown) {
      console.warn(`[Good Games] Failed to fetch page ${pageNum}: ${err}`);
      return [];
    }
  }

  async *scrapeAll(): AsyncGenerator<ScrapedCard> {
    console.log("[Good Games] Starting scrape via Shopify products.json...");

    let page = 1;
    let totalProducts = 0;
    let totalCards = 0;

    while (true) {
      console.log(`[Good Games] Fetching page ${page}...`);
      const products = await this.fetchPage(page);

      if (products.length === 0) {
        console.log(`[Good Games] No products on page ${page} — done.`);
        break;
      }

      totalProducts += products.length;

      for (const product of products) {
        const cards = mapProduct(product);
        totalCards += cards.length;
        for (const card of cards) {
          yield card;
        }
      }

      console.log(`[Good Games] Page ${page}: ${products.length} products → ${totalCards} card variants so far`);

      if (products.length < PAGE_SIZE) {
        // Last page — no need to fetch another
        break;
      }

      page++;
    }

    console.log(`[Good Games] Done. ${totalProducts} products → ${totalCards} ScrapedCard entries.`);
  }
}
