/**
 * Shared scraper utilities.
 */

/** Today's date as "YYYY-MM-DD" string. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calculate and format a match rate percentage.
 * Returns "0" if total is 0.
 */
export function matchRate(matched: number, total: number): number {
  if (total === 0) return 0;
  return parseFloat(((matched / total) * 100).toFixed(1));
}
