/**
 * Shared name-matching utilities.
 * Used by the card matcher (scraper) and eventually by the web UI for search.
 */

/**
 * Normalise a card name for comparison.
 * - Strips accents (é → e)
 * - Lowercases
 * - Replaces all non-alphanumeric characters with spaces (handles ",", "-", "//", etc.)
 * - Collapses whitespace
 *
 * Applied consistently to both Scryfall DB names and store-scraped names
 * so the same function produces the same key for both sides.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")     // collapse non-alphanumeric runs to a space
    .trim();
}

/**
 * Strip trailing variant annotations from a store card name.
 * e.g. "Ajani, Outland Chaperone (Borderless 284)" → "Ajani, Outland Chaperone"
 *      "Adept Watershaper (Showcase 297)"           → "Adept Watershaper"
 *      "Lightning Bolt"                             → "Lightning Bolt"
 */
export function stripVariant(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Standard Levenshtein (edit) distance. O(m * n).
 * Used for fuzzy card name matching when exact lookup fails.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Single-row DP (space-optimised)
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insert
        prev[j] + 1,            // delete
        prev[j - 1] + cost,     // substitute
      );
    }
    prev = curr;
  }

  return prev[b.length];
}

/**
 * Normalise a set name for comparison (same rules as normalizeName).
 * e.g. "Magic: The Gathering - Revised" → "magic the gathering revised"
 */
export function normalizeSetName(name: string): string {
  return normalizeName(name);
}

/**
 * Map of common store set name variants → Scryfall set codes.
 * Add entries here when a scraper uses set names instead of codes,
 * or when the store spells a set name differently from Scryfall.
 *
 * Keys should be the result of normalizeSetName(storeSetName).
 */
export const SET_ALIASES: Record<string, string> = {
  // Revised / early sets
  "revised":                          "3ed",
  "revised edition":                  "3ed",
  "fourth edition":                   "4ed",
  "fourth ed":                        "4ed",
  "fifth edition":                    "5ed",
  "sixth edition":                    "6ed",
  "classic sixth edition":            "6ed",
  "seventh edition":                  "7ed",
  "eighth edition":                   "8ed",
  "ninth edition":                    "9ed",
  "tenth edition":                    "10e",

  // Alpha / Beta / Unlimited
  "alpha":                            "lea",
  "beta":                             "leb",
  "unlimited":                        "2ed",
  "unlimited edition":                "2ed",

  // Common short names
  "ravnica":                          "rav",
  "ravnica city of guilds":           "rav",
  "time spiral":                      "tsp",
  "lorwyn":                           "lrw",
  "morningtide":                      "mor",
  "shadowmoor":                       "shm",
  "eventide":                         "eve",
};
