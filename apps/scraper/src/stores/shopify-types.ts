/**
 * Shopify JSON API response shapes, shared between the scraper and its
 * per-format title parsers.
 */

export interface ShopifyOption {
  name: string; // e.g. "Condition", "Finish", "Title"
  values: string[];
}

export interface ShopifyVariant {
  id: number;
  title: string; // e.g. "Near Mint / Non-Foil" or "Default Title"
  price: string; // AUD as decimal string e.g. "4.50"
  sku: string | null; // e.g. "MOC-381-EN-NF-1" or "MTG-TLA-336-01WREUQWQQ"
  available: boolean;
  inventory_quantity: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  tags: string[]; // May include set names, colours, etc.
  options: ShopifyOption[];
  variants: ShopifyVariant[];
}

export interface ProductsResponse {
  products: ShopifyProduct[];
}

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
