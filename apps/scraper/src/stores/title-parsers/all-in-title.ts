/**
 * "all-in-title" parser — stores that bake card name + collector# + set + foil
 * + condition all into the product title with a single "Default Title" variant.
 *
 * Two dialects, both selected via `titleFormat: "all-in-title"` in stores.config.ts:
 *
 *   Raptor Games Format 1 (ends with NM/M):
 *     "{Name} [{Treatments}] {Collector#} [{Rarity}] {Set} [Foil] NM/M"
 *     e.g. "Wooded Foothills 236 Rare Modern Horizons 3 NM/M"
 *
 *   Raptor Games Format 2 (ends with NM only):
 *     "{Name} [{Treatments}] {M|R|U|C|L} {Set} {Collector#} NM"
 *     e.g. "Shadow of the Second Sun M Modern Horizons 3 70 NM"
 *
 *   Secret Lair individual card format (detected by 2+ pipe separators):
 *     "MTG Brand | Secret Lair Name | Card Name [Foil Edition]"
 *     Single-pipe listings are bundle/pack products (not individual singles) —
 *     left to fall through as unmatched rather than emitting garbage card names.
 */

import { stripVariant } from "@mtg-au/shared";
import type { ShopifyProduct } from "../shopify-types.js";

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

export interface AllInTitleResult {
  cardName: string;
  setName: string | null;
  collectorNumber: string | null;
  titleFoil: boolean;
}

export function parseAllInTitleFormat(product: ShopifyProduct): AllInTitleResult {
  // Secret Lair individual card format: 3+ pipe-separated segments; last is the card name.
  const pipeParts = product.title.split(" | ");
  if (pipeParts.length >= 3) {
    const lastPart = pipeParts[pipeParts.length - 1].trim();
    const titleFoil = /\bFoil\b/i.test(lastPart);
    const cardName = lastPart.replace(/\s+Foil\s+Edition\s*$/i, "").trim();
    return { cardName, collectorNumber: null, setName: null, titleFoil };
  }

  const isFmt2 = /\s+NM\s*$/.test(product.title) && !/NM\/M/i.test(product.title);

  if (isFmt2) {
    // ── Format 2 ────────────────────────────────────────────────────────────
    let working = product.title.replace(/\s+NM\s*$/, "").trim();

    // Collector# is the last standalone integer before NM (absent for some
    // "The List Reprints" style listings that use fraction notation instead).
    let collectorNumber: string | null;
    const cm2 = /\s+(\d{1,4}[a-z]?)\s*$/.exec(working);
    if (cm2) {
      collectorNumber = String(parseInt(cm2[1], 10));
      working = working.slice(0, working.length - cm2[0].length).trim();
    } else {
      collectorNumber = null;
    }

    const titleFoil = /\bFoil\b/i.test(working);

    // The rarity letter (or "Land") separates the card name+treatments from
    // the set name. Use the LAST occurrence to handle edge cases where a
    // number (pre-rarity collector#) sits between name and rarity.
    const rarityMatches = [...working.matchAll(RARITY_LETTER_RE)];
    const rarityMatch = rarityMatches.at(-1);
    let cardName: string;
    let setName: string | null;
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
    return { cardName, setName, collectorNumber, titleFoil };
  }

  // ── Format 1 ────────────────────────────────────────────────────────────
  let working = product.title.replace(/\s+NM\s*\/\s*M\s*$/i, "").trim();

  const titleFoil = /\bFoil\b/i.test(working);

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
  let cardName: string;
  let collectorNumber: string | null;
  let setName: string | null;
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
  return { cardName, setName, collectorNumber, titleFoil };
}
