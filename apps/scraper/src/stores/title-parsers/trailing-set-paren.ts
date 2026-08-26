/**
 * "trailing-set-paren" dialect — Chromatic Games.
 *
 *   "{Name} {COLLECTOR}[/{SetSize}] ({Set Name})[  - {Treatment/Finish}]"
 *
 *   "Karador, Ghost Chieftain 342/451 (Commander Masters)"
 *   "Krosan Tusker 302/451 (Commander Masters)  - Foil"
 *   "Meren of Clan Nel Toth 584 (Commander Masters)  - Etched Foil"
 *   "Lazotep Sliver 764/451 (Commander Masters)  - Extended Art Foil"
 *
 * The standard parser mangles both shapes: with a treatment suffix its dash rule
 * fires first and yields the set name "Foil"; without one, its bracket rule
 * leaves the collector number glued to the card name ("Karador, Ghost Chieftain
 * 342/451"). Neither matches, which is how the store reached a 0.7% match rate.
 *
 * Foil comes from the title suffix and nowhere else — the store's only variant
 * option axis is Condition, so there is no per-variant foil signal to read.
 */

import type { ShopifyProduct, DialectTitleResult } from "../shopify-types.js";

/**
 * Greedy name group so the collector number binds to the LAST number before the
 * set parenthetical — card names of their own can end in digits.
 * The "/451" is the set size printed on the card, not part of the collector number.
 */
const TITLE_RE = /^(.+)\s+(\d{1,4}[a-z]?)(?:\/\d+)?\s+\(([^()]+)\)\s*(?:-\s*(.+?))?\s*$/i;

export function parseTrailingSetParenTitle(product: ShopifyProduct): DialectTitleResult {
  const match = TITLE_RE.exec(product.title.trim());

  if (!match) {
    return {
      cardName: product.title.trim(),
      setCode: null, setName: null, collectorNumber: null,
      titleFoil: null, titleFinish: null, treatment: null,
    };
  }

  const [, name, collector, setName, suffix = ""] = match;
  const isEtched = /\betched\b/i.test(suffix);
  const isFoil = /\bfoil\b/i.test(suffix);

  return {
    cardName: name.trim(),
    setCode: null,
    setName: setName.trim(),
    collectorNumber: collector.toLowerCase(),
    titleFoil: isFoil,
    titleFinish: isEtched ? "etched" : isFoil ? "foil" : "nonfoil",
    treatment: null,
  };
}
