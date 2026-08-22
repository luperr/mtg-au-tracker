/**
 * Normalise a card condition string to one of our standard codes:
 *   NM, LP, MP, HP, DMG
 *
 * Handles variants from Shopify stores, MTG Mate, and other AU retailers.
 * eBay condition extraction is separate (regex-based title parsing in ebay/transform.ts).
 */
/** The only condition codes normaliseCondition is allowed to produce. */
export const CARD_CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;

export type CardCondition = (typeof CARD_CONDITIONS)[number];

/**
 * True when `value` is one of our standard condition codes.
 *
 * normaliseCondition passes unrecognised input straight through, which is fine
 * for lenient callers but means a scraper reading conditions out of arbitrary
 * markup can store junk (CrystalCommerce's aggregate "All variants" row) in
 * store_prices.condition, where it then shows up in the web UI's filters.
 * Callers that parse untrusted text should gate on this.
 */
export function isKnownCondition(value: string): value is CardCondition {
  return (CARD_CONDITIONS as readonly string[]).includes(value);
}

export function normaliseCondition(raw: string): string {
  switch (raw.toLowerCase().trim()) {
    // Near Mint
    case "near mint":
    case "nm":
    case "mint":
    case "m":
    case "regular":        // MTG Mate uses "Regular" for NM
    case "nm-mint":        // CrystalCommerce
      return "NM";

    // Lightly Played
    case "lightly played":
    case "light played":
    case "light play":     // CrystalCommerce
    case "lp":
    case "excellent":
    case "ex":
      return "LP";

    // Moderately Played
    case "moderately played":
    case "moderate played":
    case "moderate play":  // CrystalCommerce
    case "mp":
    case "good":
    case "gd":
      return "MP";

    // Heavily Played
    case "heavily played":
    case "heavy played":
    case "heavy play":     // CrystalCommerce
    case "hp":
    case "played":
      return "HP";

    // Damaged
    case "damaged":
    case "dmg":
    case "poor":
      return "DMG";

    default:
      return raw.trim();
  }
}
