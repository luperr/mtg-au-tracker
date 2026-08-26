/**
 * "flag-prefix" dialect — Cherry Collectables.
 *
 * The store has no single title template. What every listing does have is a
 * leading run of finish/treatment words, a collector number, and a set tail:
 *
 *   {flags/treatments} {Card Name} {collector} - [{rarity}] {Set Name} [- {rarity}]
 *
 * Real titles, all pulled from the live Storefront API:
 *
 *   "[FOIL] Mountain (Chocobo Track Foil) #481 - LAND FIC - Commander: FINAL FANTASY"
 *   "Bitterblossom 085/254 - Mythic Ultimate Masters"
 *   "Fortified Village No 404 - New Capenna Commander"
 *   "FOIL Rivaz of the Claw 215 /281 - Rare Dominaria United"
 *   "Foil Extended Art - Pursued Whale 351 - Core Set 2021"
 *   "Foil Showcase Voldaren Bloodcaster // Bloodbat Summoner - No 298 Rare Crimson Vow"
 *   "FOIL EXTENDED Overlord of the Balemurk - #377- Mythic Duskmourn: House of Horror"
 *   "Ragnar - Rare - 1994 Magic the Gathering Legends"
 *
 * So the collector number is the anchor, not any fixed separator: the card name
 * is what sits between the leading treatment words and the collector, and the
 * set tail is what follows it.
 *
 * The standard parser splits on the first " - ", which for this store lands
 * almost anywhere, and it leaves the flags glued to the card name — the store's
 * unmatched rows were literally "[FOIL] Mountain" and "[ EF ] [FOIL] Damnation".
 * That held it to an 18.8% match rate.
 */

import { stripVariant } from "@mtg-au/shared";
import type { ShopifyProduct } from "../shopify-types.js";
import type { DialectTitleResult } from "./types.js";

/** Bracketed flags: "[FOIL]", "[ EF ]" (etched foil), "[ BL ]" (borderless). */
const BRACKET_FLAG_RE = /^\s*\[([^\]]*)\]\s*/;

/**
 * Leading finish/treatment words, stripped one at a time off the front.
 * A closed vocabulary rather than a pattern, so a card name is never eaten:
 * "art" is only taken directly after "extended", since "Artful Dodge" is a card
 * and "Art" on its own is not a treatment.
 */
const LEADING_WORDS = new Set([
  "foil", "foils", "nonfoil", "non-foil", "etched", "galaxy", "gilded", "surge",
  "rainbow", "textured", "borderless", "showcase", "sketch", "extended", "retro",
  "frame", "promo",
]);

/** Multi-card listings priced per playset — not a single, so not ours. */
const PLAYSET_RE = /\b(playset|4x)\b/i;

const FOIL_WORDS = /\b(foil|foils)\b/i;
const ETCHED_WORDS = /\b(etched|ef)\b/i;
const BORDERLESS_WORDS = /\b(borderless|boderless|bl)\b/i;

/** Rarity words that prefix or suffix the set name, and stand alone as a segment. */
const RARITY_RE = /^(mythic rare|basic land|uncommon|special|mythic|common|promo|rare|land|token)$/i;
const RARITY_PREFIX_RE = /^(mythic rare|basic land|uncommon|special|mythic|common|promo|rare|land|token)\s+/i;
/** Treatment words that also lead the set tail ("Showcase Mh2 Modern Horizons 2"). */
const TAIL_TREATMENT_PREFIX_RE = /^(showcase|sketch|borderless|extended art|extended|etched|foil)\s+/i;
/**
 * A set code standing alone or heading a segment: "2X2", "FIC", "MH2", "Mh2".
 * It must be all-caps or carry a digit — otherwise the first word of a set name
 * qualifies, and "New Capenna Commander" loses its "New".
 */
const SET_CODE_RE = /^((?:[A-Z0-9]{2,4}|[A-Za-z0-9]*\d[A-Za-z0-9]*))(?:\s+(.*))?$/;

/**
 * The collector number, in every notation the store uses. Ordered most to least
 * specific; the bare trailing number is last because it is the only one that
 * could plausibly be part of a card name.
 */
const COLLECTOR_PATTERNS: RegExp[] = [
  /#\s*(\d{1,4})[a-z]?\b/i,             // "#481", "#377"
  /\bNo\.?\s*(\d{1,4})[a-z]?\b/i,       // "No 404", "No. 298"
  /\b(\d{1,4})[a-z]?\s*\/\s*\d{1,4}\b/, // "085/254", "215 /281"
  /\b([A-Z]\d{1,4})\b/,                 // "P0006" promo numbering
  /\s(\d{1,4})[a-z]?\s*(?=-|$)/,        // bare, immediately before " - " or the end
];

interface Prefix {
  isFoil: boolean;
  isEtched: boolean;
  isBorderless: boolean;
  rest: string;
}

/**
 * Peel the bracketed flags and leading treatment words off the front, recording
 * what they said about finish and treatment.
 */
function readPrefix(title: string): Prefix {
  let rest = title.trim();
  let flags = "";

  for (;;) {
    const bracket = BRACKET_FLAG_RE.exec(rest);
    if (bracket) {
      flags += " " + bracket[1];
      rest = rest.slice(bracket[0].length);
      continue;
    }
    const word = /^\s*([A-Za-z][A-Za-z-]*)\b/.exec(rest);
    const lower = word?.[1].toLowerCase();
    // "art" is a treatment only as the tail of "extended art".
    const isArtSuffix = lower === "art" && /\bextended\s*$/i.test(flags);
    if (word && lower && (LEADING_WORDS.has(lower) || isArtSuffix)) {
      flags += " " + word[1];
      rest = rest.slice(word[0].length);
      continue;
    }
    break;
  }

  // "Foil Extended Art - Pursued Whale 351 - ..." puts a separator between the
  // treatment block and the name; so does a stray leading dash.
  rest = rest.replace(/^\s*[-–—]\s*/, "").trim();
  // "(A) Plains" — the single-letter variant marker on the APAC/Euro land promos.
  rest = rest.replace(/^\(\s*[A-Za-z]\s*\)\s*/, "").trim();

  return {
    isEtched: ETCHED_WORDS.test(flags),
    isFoil: FOIL_WORDS.test(flags) || ETCHED_WORDS.test(flags),
    isBorderless: BORDERLESS_WORDS.test(flags),
    rest,
  };
}

/**
 * Read the "[{rarity}] {SET} {Set Name} [- {rarity}]" tail. Both fields may come
 * back null, in which case the matcher falls back to name-only rather than
 * guessing.
 */
function parseTail(tail: string): { setCode: string | null; setName: string | null } {
  const segments = tail.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean);
  let setCode: string | null = null;
  const nameParts: string[] = [];

  for (const segment of segments) {
    if (RARITY_RE.test(segment)) continue;
    let text = segment.replace(RARITY_PREFIX_RE, "").replace(TAIL_TREATMENT_PREFIX_RE, "").trim();
    const codeMatch = SET_CODE_RE.exec(text);
    // A set code must contain a letter — "2024 Year of the Dragon Promo" opens
    // with a year, not a code.
    if (setCode === null && codeMatch && /[A-Za-z]/.test(codeMatch[1]) && codeMatch[1].length <= 4) {
      setCode = codeMatch[1].toLowerCase();
      text = codeMatch[2]?.trim() ?? "";
    }
    if (text) nameParts.push(text);
  }

  const last = nameParts.at(-1) ?? null;
  return { setCode, setName: last ? stripVariant(last) || last : null };
}

/** Find the collector number and split the title around it. */
function splitOnCollector(body: string): { name: string; collector: string; tail: string } | null {
  for (const pattern of COLLECTOR_PATTERNS) {
    const match = pattern.exec(body);
    if (!match) continue;
    const name = body.slice(0, match.index).replace(/\s*[-–—]\s*$/, "").trim();
    // A collector pattern that swallows the whole name is a false positive.
    if (!name) continue;
    return {
      name,
      collector: match[1].replace(/^([A-Za-z]?)0*(\d)/, "$1$2").toLowerCase(),
      tail: body.slice(match.index + match[0].length).replace(/^\s*[-–—]\s*/, "").trim(),
    };
  }
  return null;
}

/** Returns null when the listing is not a single and should be skipped. */
export function parseFlagPrefixTitle(product: ShopifyProduct): DialectTitleResult | null {
  if (PLAYSET_RE.test(product.title)) return null;

  const prefix = readPrefix(product.title);
  const treatment = prefix.isBorderless ? "borderless" : null;
  const titleFinish = prefix.isEtched ? "etched" : prefix.isFoil ? "foil" : "nonfoil";

  const split = splitOnCollector(prefix.rest);
  if (split) {
    const { setCode, setName } = parseTail(split.tail);
    return {
      cardName: stripVariant(split.name) || split.name,
      setCode,
      setName,
      collectorNumber: split.collector,
      titleFoil: prefix.isFoil,
      titleFinish,
      treatment,
    };
  }

  // No collector number anywhere — "Ragnar - Rare - 1994 Magic the Gathering
  // Legends". The name is then the first dash-separated segment.
  const segments = prefix.rest.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean);
  const rawName = segments.shift() ?? prefix.rest;
  const { setCode, setName } = parseTail(segments.join(" - "));

  return {
    cardName: stripVariant(rawName) || rawName,
    setCode,
    setName,
    collectorNumber: null,
    titleFoil: prefix.isFoil,
    titleFinish,
    treatment,
  };
}
