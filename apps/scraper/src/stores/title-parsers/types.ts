/**
 * Shared result shape for the per-store title dialects.
 *
 * `standard.ts` predates this and keeps its own narrower type; the dialect
 * parsers added since return this so `mapProduct()` can dispatch on
 * `titleFormat` without a per-dialect branch for every field.
 *
 * A `null` field means "this dialect couldn't determine it" — the matcher
 * degrades to a lower confidence level rather than guessing.
 */
export interface DialectTitleResult {
  cardName: string;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  /** Non-null overrides variant/SKU/tag foil detection for this store. */
  titleFoil: boolean | null;
  /** Non-null when the title declares the finish outright (e.g. "Etched Foil"). */
  titleFinish: "nonfoil" | "foil" | "etched" | null;
  /**
   * Set when the dialect encodes treatment somewhere `extractTreatment()` can't
   * see it (Cherry's "[ BL ]" flag). Null means "fall back to the title scan".
   */
  treatment: string | null;
}
