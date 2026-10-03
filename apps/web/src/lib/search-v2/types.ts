/**
 * Result shapes for the v2 search, split from query.ts so client components can
 * import them without pulling the postgres driver into the browser bundle.
 */
import type { FacetKey } from "./params.js";

export const SEARCH_V2_PAGE_SIZE = 24;

export type SearchTile = {
  key: string;
  card_id: string;
  slug: string | null;
  name: string;
  printing_id: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  is_foil: boolean;
  finish: "nonfoil" | "foil" | "etched";
  treatment: string;
  border_color: string | null;
  frame_effects: string[];
  image_uri: string | null;
  price: number;
  shipping_aud: string | null;
  condition: string | null;
  in_stock: boolean;
  url: string | null;
  store_id: string;
  store_name: string;
  /** Other stores with a matching listing for this tile's group. Null in `all` view. */
  other_stores: number | null;
  /** Cheapest price among those other stores. */
  other_min: number | null;
};

export type FacetCount = { value: string; label: string; count: number };
export type Facets = Record<FacetKey, FacetCount[]>;

export type SearchV2Result = {
  tiles: SearchTile[];
  total: number;
  /** True when the name matched more than SEARCH_V2_CARD_CAP cards. */
  capped: boolean;
  facets: Facets;
};
