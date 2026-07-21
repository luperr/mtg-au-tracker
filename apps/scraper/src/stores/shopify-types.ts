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
