/**
 * "paren-set-code" dialect — Spellroo Gaming.
 *
 *   "{Name}[ ({Treatment})] ({SET} - {COLLECTOR}) - {Set Name} - {Rarity} - {Foil|Normal}"
 *
 *   "Into the Flood Maw (BLB - 52) - Bloomburrow - Uncommon - Normal"
 *   "Chaos Warp (Borderless) (MAR - 69) - Marvel Universe Eternal-Legal - Mythic - Normal"
 *   "Noble Hierarch (LIST - 151/249) - The List Reprints - Rare - Normal"
 *
 * The standard parser cannot read these: its dash rule splits at the FIRST
 * " - ", which for this store sits *inside* the set/collector parenthetical, so
 * "Hex Magic (MSH - 133) - ..." parsed out as the card name "Hex Magic (MSH".
 * That is what put the store at a 0.1% match rate on its first production run.
 *
 * The trailing "- Foil"/"- Normal" is the default variant's finish, not the
 * product's — every product carries both. Foil is left to the per-variant
 * "Printing" option axis, which parseVariant() already reads.
 */

import { stripVariant } from "@mtg-au/shared";
import type { ShopifyProduct, DialectTitleResult } from "../shopify-types.js";

/**
 * "(BLB - 52)" / "(LIST - 151/249)". The "/249" is the set size printed on The
 * List cards, not part of the collector number, so it is dropped.
 */
const SET_COLLECTOR_RE = /\(([A-Z0-9]{2,6})\s*-\s*(\d{1,4}[a-z]?)(?:\/\d+)?\)/i;

/** Trailing "- {Rarity} - {Finish}" that every title ends with. */
const RARITY_WORDS = new Set(["common", "uncommon", "rare", "mythic", "special", "land", "basic land", "promo", "token"]);
const FINISH_WORDS = new Set(["normal", "foil"]);

export function parseParenSetCodeTitle(product: ShopifyProduct): DialectTitleResult {
  const match = SET_COLLECTOR_RE.exec(product.title);

  if (!match) {
    // No set/collector parenthetical — keep the name and let the matcher fall
    // back to name-only rather than emitting a mangled name.
    const name = stripVariant(product.title) || product.title;
    return { cardName: name, setCode: null, setName: null, collectorNumber: null, titleFoil: null, titleFinish: null, treatment: null };
  }

  const beforeParen = product.title.slice(0, match.index).trim();
  const afterParen = product.title.slice(match.index + match[0].length).replace(/^\s*-\s*/, "").trim();

  // "(Borderless)" / "(0393)" treatment parentheticals sit between the name and
  // the set parenthetical; stripVariant removes them from the end of the slice.
  const cardName = stripVariant(beforeParen) || beforeParen;

  // "{Set Name} - {Rarity} - {Finish}". Set names can be long but contain no
  // " - " of their own, so drop the trailing rarity/finish segments and keep
  // the rest — joined, so an unexpected shape degrades instead of truncating.
  const segments = afterParen.split(" - ").map((s) => s.trim()).filter(Boolean);
  while (segments.length > 1) {
    const last = segments[segments.length - 1].toLowerCase();
    if (FINISH_WORDS.has(last) || RARITY_WORDS.has(last)) segments.pop();
    else break;
  }
  const setName = segments.length > 0 ? segments.join(" - ") : null;

  return {
    cardName,
    setCode: match[1].toLowerCase(),
    setName,
    collectorNumber: match[2].toLowerCase(),
    titleFoil: null,
    titleFinish: null,
    treatment: null,
  };
}
