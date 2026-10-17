/**
 * "set-slash-collector" dialect — Arcane Alfred.
 *
 * Every title is the card name followed by the Scryfall set code and collector
 * number, slash-separated. Real titles, all pulled from the live store:
 *
 *   "Gorilla Shaman ALL/72a"
 *   "Shipwreck Marsh FRA/401"            — borderless; only the number says so
 *   "B.O.B. (Bevy of Beebles) UND/18"
 *   "Haru-Onna PLST/SOK-132"             — The List, in Scryfall's own notation
 *
 * The SKUs are random UUIDs, so the standard parser's SKU path finds nothing and
 * its title fallbacks don't recognise the trailing code — every listing would
 * drop to a name-only match. Treatment and finish aren't in the title at all:
 * treatment is implied by the collector number, finish is a variant option.
 */

import type { ShopifyProduct, DialectTitleResult } from "../shopify-types.js";

/**
 * "{name} {SET}/{collector}". The collector may carry a letter, a symbol ("★",
 * "†") or a set prefix, so it is anything up to the end bar whitespace.
 */
const TITLE_RE = /^(.+?)\s+([A-Za-z0-9]{2,6})\/(\S+)$/;

/**
 * Returns null when the title isn't a single's. Every single this store lists
 * carries the code, and the scrape has no product-type filter — so an
 * unrecognised title is more likely sealed product than a card, and matching it
 * by name would hang its price on whatever card it resembles.
 */
export function parseSetSlashCollectorTitle(product: ShopifyProduct): DialectTitleResult | null {
  const match = TITLE_RE.exec(product.title.trim());
  if (!match) return null;

  return {
    cardName: match[1].trim(),
    setCode: match[2].toLowerCase(),
    setName: null,
    // Scryfall stores numbers unpadded, and case matters in "SOK-132".
    collectorNumber: match[3].replace(/^0+(?=\d)/, ""),
    // Finish comes from the Treatment option (Regular / Foil / Etched).
    titleFoil: null,
    titleFinish: null,
    treatment: null,
  };
}
