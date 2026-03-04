/**
 * Card name normalisation and matching utilities.
 * Used by both the scraper (to match scraped names) and the web app (for search).
 */

/**
 * Normalise a card name for matching purposes.
 * Lowercases, strips punctuation, collapses whitespace.
 *
 * "Jace, the Mind Sculptor" → "jace the mind sculptor"
 * "Fire // Ice" → "fire ice"
 * "Séance" → "seance"
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    // Replace accented characters with ASCII equivalents
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Replace // (split card separator) with space
    .replace(/\s*\/\/\s*/g, " ")
    // Strip all non-alphanumeric except spaces
    .replace(/[^a-z0-9\s]/g, "")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simple Levenshtein distance for fuzzy matching.
 * Returns the minimum number of single-character edits needed.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Normalise a set name for matching.
 * Stores use inconsistent set names — this helps align them.
 *
 * "Modern Horizons 3" → "modern horizons 3"
 * "MH3" → "mh3"
 */
export function normalizeSetName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Common set name aliases that stores use differently.
 * Maps alternate names → Scryfall set codes.
 */
export const SET_ALIASES: Record<string, string> = {
  "fourth edition": "4ed",
  "4th edition": "4ed",
  "fifth edition": "5ed",
  "5th edition": "5ed",
  "revised": "3ed",
  "revised edition": "3ed",
  "unlimited": "2ed",
  "unlimited edition": "2ed",
  "alpha": "lea",
  "beta": "leb",
  "arabian nights": "arn",
  "core set 2021": "m21",
  "core set 2020": "m20",
  "core set 2019": "m19",
};
