/**
 * Normalise a card condition string to one of our standard codes:
 *   NM, LP, MP, HP, DMG
 *
 * Handles variants from Shopify stores, MTG Mate, and other AU retailers.
 * eBay condition extraction is separate (regex-based title parsing in ebay/transform.ts).
 */
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
