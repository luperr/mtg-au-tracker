/**
 * Standard title parser — the default dialect for Shopify stores that don't
 * declare a `titleFormat` in their config.
 *
 * Prefers the SKU (see sku-parser.ts) for set code / collector number / foil,
 * falling back to several title conventions layered on top of each other:
 *   - Crit Hit style: "Name (Borderless) [FIC - 483]" — set+collector in one bracket.
 *   - Mega Games style: "Card Name (variant) #NNNN COLOR RARITY [SET]" — trailing
 *     [SET] bracket(s) + "#NNNN" collector extraction.
 *   - Plain dash/bracket suffix: "Name - Set Name" / "Name (Set Name)".
 *   - LotR Commander "named land" cards, e.g.
 *     "Helm's Deep - Shinka, the Bloodsoaked Keep - The LotR: Commander".
 */

import { stripVariant } from "@mtg-au/shared";
import type { ShopifyProduct } from "../shopify-types.js";
import { parseSkuData } from "../sku-parser.js";

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

export interface StandardTitleResult {
  cardName: string;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  skuFoil: boolean | null;
}

/** Returns null when the product should be skipped entirely (unhandled variant type). */
export function parseStandardTitle(product: ShopifyProduct): StandardTitleResult | null {
  const skuData = parseSkuData(product.variants[0]?.sku);
  let setCode: string | null = null;
  let collectorNumber: string | null = null;

  // Crit Hit style: "Name (Borderless) [FIC - 483]" — set+collector in one bracket.
  // Extract before other parsing so dashMatch can't fire on the wrong " - ".
  const bracketSetCollector = product.title.match(/\[([A-Z0-9]{2,6})\s*-\s*(\d{1,4}[a-z]?)\]\s*$/i);
  if (bracketSetCollector && !skuData.setCode) {
    setCode = bracketSetCollector[1].toLowerCase();
    collectorNumber = String(parseInt(bracketSetCollector[2], 10));
  }

  // ── Mega Games-style title pre-processing ──────────────────────────────
  // Titles: "Card Name (variant) #NNNN COLOR RARITY [SET]" or "... [SET1] [SET2]"
  // Strip ALL trailing [SETCODE] brackets; the rightmost is the actual Scryfall set.
  // Then extract collector from "#NNNN" and derive a clean card name.
  let titleSetCode: string | null = null;
  let titleCollector: string | null = null;
  let titleCardName: string | null = null;
  let workingTitle: string;

  if (bracketSetCollector) {
    workingTitle = product.title.slice(0, bracketSetCollector.index!).trim();
  } else {
    workingTitle = product.title;
    // TODO(future-store): trailing [SET] bracket stripping fires for ANY store whose
    // product titles end with a [2-6 char alphanumeric] bracket.  If a future store
    // uses brackets for something other than set codes (e.g. "[Foil]", "[Bundle]"),
    // the wrong value will land in titleSetCode.  Level 0 would then fail (wrong set),
    // but name-only fallback still works, so the impact is a match-quality regression
    // rather than a hard break.  Gate with a config flag if that becomes a problem.
    const trailingSetBracket = /\s*\[([A-Z0-9]{2,6})\]\s*$/i;
    let tbm: RegExpExecArray | null;
    while ((tbm = trailingSetBracket.exec(workingTitle)) !== null) {
      if (!titleSetCode) titleSetCode = tbm[1].toLowerCase(); // first stripped = rightmost = actual set
      workingTitle = workingTitle.slice(0, tbm.index).trim();
    }

    // TODO(future-store): #NNNN extraction fires on any title that has "#" followed
    // by 1-4 digits at a word boundary (not at position 0).  Future stores that embed
    // internal product codes as "#NNN" in titles will have those codes mistaken for
    // Scryfall collector numbers.  If a new store triggers this unintentionally, add a
    // config flag (e.g. titleFormat: "mega_games") to scope it explicitly.
    const hashCollector = /#(\d{1,4}[a-z]?)(?=\s|$)/i.exec(workingTitle);
    if (hashCollector && hashCollector.index > 0) {
      titleCollector = String(parseInt(hashCollector[1], 10));
      const beforeHash = workingTitle.slice(0, hashCollector.index).trim();
      // Strip entire Borderless-containing parentheticals (e.g. "(Japanese Borderless)")
      const cleaned = beforeHash
        .replace(/\s*\([^)]*\bborderless\b[^)]*\)/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      titleCardName = stripVariant(cleaned) || cleaned;
    }
  }

  const hasSkuMatch = skuData.setCode !== null && skuData.collectorNumber !== null;
  const hasTitleMatch = titleSetCode !== null && titleCollector !== null;
  if (!hasSkuMatch && !bracketSetCollector && !hasTitleMatch && isSkippedVariant(product.title)) return null;

  setCode = setCode ?? skuData.setCode ?? titleSetCode;

  const collectorMatch = COLLECTOR_NUM_RE.exec(product.title);
  collectorNumber = collectorNumber ?? skuData.collectorNumber ?? titleCollector ?? (collectorMatch ? String(parseInt(collectorMatch[1], 10)) : null);

  let cardName: string;
  let setName: string | null;

  if (titleCardName) {
    // Card name was cleanly extracted from #NNNN split — use it directly.
    cardName = titleCardName;
    setName = null; // set code already captured in titleSetCode → setCode
  } else {
    // Fall back to parseProductTitle on the bracket-stripped workingTitle.
    let cleanTitle = workingTitle;
    if (collectorMatch && !bracketSetCollector) cleanTitle = cleanTitle.replace(collectorMatch[0], "");
    if (BORDERLESS_WORD.test(cleanTitle)) cleanTitle = cleanTitle.replace(BORDERLESS_WORD, "");
    cleanTitle = cleanTitle.replace(/\s{2,}/g, " ").trim();

    const { cardName: parsedCardName, setName: titleSetName } = parseProductTitle(cleanTitle);
    const rawSetName = extractSetFromTags(product.tags) ?? titleSetName;
    const resolved = extractLotRStyleName(parsedCardName, rawSetName);
    cardName = resolved.rawName;
    setName = bracketSetCollector ? null : resolved.resolvedSetName;
  }

  return { cardName, setCode, setName, collectorNumber, skuFoil: skuData.isFoil };
}
