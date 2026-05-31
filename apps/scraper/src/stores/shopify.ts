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

import { type ScrapedCard, normaliseCondition, stripVariant, extractTreatment } from "@mtg-au/shared";
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

  // Format C: SET-RARITY-TYPE-COLLECTOR-FINISH  e.g. "SOS-C-L-0267-N", "SOS-C-G-0162-F"
  // Used by Mega Games. RARITY and TYPE are single letters; FINISH is N (nonfoil) or F (foil).
  const formatC = sku.match(/^([A-Z0-9]{2,6})-[A-Z]-[A-Z]-(\d{1,4}[a-z]?)-([NF])$/i);
  if (formatC) {
    return {
      setCode: formatC[1].toLowerCase(),
      collectorNumber: String(parseInt(formatC[2], 10)),
      isFoil: formatC[3].toUpperCase() === "F",
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

const ALL_IN_TITLE_RARITY_RE = /\b(Mythic Rare|Mythic|Common|Uncommon|Rare|Special|Basic Land)\b/i;

// Single-letter rarity abbreviations used in Raptor Games Format 2 titles,
// plus the word "Land" for basic lands that skip the single-letter abbreviation.
// S = Special rarity (e.g. Time Spiral Remastered timeshifted cards).
// P = Promo (store championships, FNM, Grand Prix, etc.).
const RARITY_LETTER_RE = /\b([MRUCLSP]|Land)\b/g;

/**
 * Strip store-specific prefixes/suffixes from a set name extracted from a Raptor
 * Games product title. Scryfall doesn't use the "Universes Beyond:" category prefix,
 * and some listings append a parenthetical set-code hint like "(M14)".
 */
function normalizeRaptorSetName(raw: string): string | null {
  const s = raw
    .replace(/^Universes Beyond:\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  return s || null;
}

export function mapProduct(product: ShopifyProduct, config: ShopifyStoreConfig): ScrapedCard[] {
  const baseUrl = config.baseUrl;
  if (isTokenOrEmblem(product)) return [];

  // Raptor Games bakes all metadata into the product title with a single
  // "Default Title" variant. Two title formats are used:
  //
  //   Format 1 (ends with NM/M):
  //     "{Name} [{Treatments}] {Collector#} [{Rarity}] {Set} [Foil] NM/M"
  //     e.g. "Wooded Foothills 236 Rare Modern Horizons 3 NM/M"
  //
  //   Format 2 (ends with NM only):
  //     "{Name} [{Treatments}] {M|R|U|C|L} {Set} {Collector#} NM"
  //     e.g. "Shadow of the Second Sun M Modern Horizons 3 70 NM"
  //
  // Both are detected by the "all-in-title" titleFormat config flag.
  let cardName: string;
  let collectorNumber: string | null;
  let setName: string | null;
  let setCode: string | null = null;
  let titleFoil: boolean | null = null;  // non-null overrides variant foil detection
  let skuFoil: boolean | null = null;

  if (config.titleFormat === "all-in-title") {
    // Secret Lair individual card format: "MTG Brand | Secret Lair Name | Card Name [Foil Edition]"
    // Detect by 2+ pipe separators → 3+ segments; last segment is the card name.
    // Single-pipe listings are bundle/pack products (not individual singles) — leave them
    // to fall through as unmatched rather than emitting garbage card names.
    const pipeParts = product.title.split(" | ");
    if (pipeParts.length >= 3) {
      const lastPart = pipeParts[pipeParts.length - 1].trim();
      titleFoil = /\bFoil\b/i.test(lastPart);
      cardName = lastPart.replace(/\s+Foil\s+Edition\s*$/i, "").trim();
      collectorNumber = null;
      setName = null;
    } else {

    const isFmt2 = /\s+NM\s*$/.test(product.title) && !/NM\/M/i.test(product.title);

    if (isFmt2) {
      // ── Format 2 ────────────────────────────────────────────────────────────
      let working = product.title.replace(/\s+NM\s*$/, "").trim();

      // Collector# is the last standalone integer before NM (absent for some
      // "The List Reprints" style listings that use fraction notation instead).
      const cm2 = /\s+(\d{1,4}[a-z]?)\s*$/.exec(working);
      if (cm2) {
        collectorNumber = String(parseInt(cm2[1], 10));
        working = working.slice(0, working.length - cm2[0].length).trim();
      } else {
        collectorNumber = null;
      }

      titleFoil = /\bFoil\b/i.test(working);

      // The rarity letter (or "Land") separates the card name+treatments from
      // the set name. Use the LAST occurrence to handle edge cases where a
      // number (pre-rarity collector#) sits between name and rarity.
      const rarityMatches = [...working.matchAll(RARITY_LETTER_RE)];
      const rarityMatch = rarityMatches.at(-1);
      if (rarityMatch !== undefined && rarityMatch.index !== undefined) {
        let nameRaw = working.slice(0, rarityMatch.index).trim();
        const afterRarity = working.slice(rarityMatch.index + rarityMatch[0].length).trim();
        setName = normalizeRaptorSetName(afterRarity);

        // If no trailing collector# was found, the number may sit between the
        // card name and the rarity letter (Format 2b edge case, e.g. basic lands
        // or "The List Reprints" with inline collector numbers).
        if (!collectorNumber) {
          const innerCm = /\s+(\d{1,4}[a-z]?)\s*$/.exec(nameRaw);
          if (innerCm) {
            collectorNumber = String(parseInt(innerCm[1], 10));
            nameRaw = nameRaw.slice(0, nameRaw.length - innerCm[0].length).trim();
          }
        }

        cardName = stripVariant(nameRaw) || nameRaw;
      } else {
        // No rarity letter — try first standalone number as name/set split
        const fallbackCm = /(?:^|\s)(\d{1,4}[a-z]?)(?=\s|$)/i.exec(working);
        if (fallbackCm && fallbackCm.index !== undefined) {
          const beforeNum = working.slice(0, fallbackCm.index).trim();
          const afterNum = working.slice(fallbackCm.index + fallbackCm[0].length).trim();
          cardName = stripVariant(beforeNum) || beforeNum;
          setName = normalizeRaptorSetName(afterNum);
          if (!collectorNumber) collectorNumber = String(parseInt(fallbackCm[1], 10));
        } else {
          cardName = stripVariant(working) || working;
          setName = null;
        }
      }
    } else {
      // ── Format 1 ────────────────────────────────────────────────────────────
      let working = product.title.replace(/\s+NM\s*\/\s*M\s*$/i, "").trim();

      titleFoil = /\bFoil\b/i.test(working);

      // Strip words that aren't part of the name, set, or collector#
      working = working
        .replace(ALL_IN_TITLE_RARITY_RE, "")
        .replace(/\bFoil\b/gi, "")
        .replace(/\b(NM|LP|MP|HP|DMG)\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      // Collector# is the first standalone integer not inside parentheses.
      // Raptor zero-pads some collector numbers to 4 digits (e.g. "0216" for
      // TMNT borderless variants); strip leading zeros to match Scryfall's format.
      const cm1 = /(?:^|\s)(\d{1,4}[a-z]?)(?=\s|$)/i.exec(working);
      if (cm1 && cm1.index !== undefined) {
        collectorNumber = String(parseInt(cm1[1], 10));
        const beforeNum = working.slice(0, cm1.index).trim();
        const afterNum = working.slice(cm1.index + cm1[0].length).trim();
        setName = normalizeRaptorSetName(afterNum);
        cardName = stripVariant(beforeNum) || beforeNum || product.title;
      } else {
        cardName = stripVariant(product.title) || product.title;
        collectorNumber = null;
        setName = null;
      }
    }
    } // closes the `else` branch of the pipe-separator check
  } else {
    // ── Standard SKU + title parsing ─────────────────────────────────────────
    const skuData = parseSkuData(product.variants[0]?.sku);
    collectorNumber = null;

    // Some stores (e.g. Crit Hit) embed set+collector in a trailing bracket:
    // "Paradise Chocobo - Birds of Paradise (Borderless) [FIC - 483]"
    // Extract before any other parsing so dashMatch can't fire on the wrong " - ".
    const bracketSetCollector = product.title.match(/\[([A-Z0-9]{2,6})\s*-\s*(\d{1,4}[a-z]?)\]\s*$/i);
    if (bracketSetCollector && !skuData.setCode) {
      setCode = bracketSetCollector[1].toLowerCase();
      collectorNumber = String(parseInt(bracketSetCollector[2], 10));
    }

    const hasSkuMatch = skuData.setCode !== null && skuData.collectorNumber !== null;
    if (!hasSkuMatch && !bracketSetCollector && isSkippedVariant(product.title)) return [];

    setCode = setCode ?? skuData.setCode;
    skuFoil = skuData.isFoil;

    const collectorMatch = COLLECTOR_NUM_RE.exec(product.title);
    collectorNumber = collectorNumber ?? skuData.collectorNumber ?? (collectorMatch ? String(parseInt(collectorMatch[1], 10)) : null);

    // Strip the bracket and collector paren from the title before name parsing.
    let cleanTitle = bracketSetCollector
      ? product.title.slice(0, bracketSetCollector.index).trim()
      : product.title;
    if (collectorMatch && !bracketSetCollector) cleanTitle = cleanTitle.replace(collectorMatch[0], "");
    if (BORDERLESS_WORD.test(cleanTitle)) cleanTitle = cleanTitle.replace(BORDERLESS_WORD, "");
    cleanTitle = cleanTitle.replace(/\s{2,}/g, " ").trim();

    const { cardName: parsedCardName, setName: titleSetName } = parseProductTitle(cleanTitle);
    const rawSetName = extractSetFromTags(product.tags) ?? titleSetName;
    const resolved = extractLotRStyleName(parsedCardName, rawSetName);
    cardName = resolved.rawName;
    setName = bracketSetCollector ? null : resolved.resolvedSetName;
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
