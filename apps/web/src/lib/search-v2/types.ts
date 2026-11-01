/**
 * Result shapes for the v2 search, split from query.ts so client components can
 * import them without pulling the postgres driver into the browser bundle.
 */
import type { FacetKey, SearchView } from "./params.js";

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
  url: string | null;
  store_id: string;
  store_name: string;
  /** Other stores with a matching listing for this tile's group. Null in listings view. */
  other_stores: number | null;
  /** Cheapest price among those other stores. */
  other_min: number | null;
};

/**
 * A matched card with no in-stock listing anywhere — typically a set still in preview.
 * Shown by its newest printing, so an upcoming card shows the set it's coming in.
 */
export type UnlistedCard = {
  card_id: string;
  slug: string | null;
  name: string;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  image_uri: string | null;
  released_at: string | null;
  /** released_at is after today. */
  upcoming: boolean;
};

export type FacetCount = { value: string; label: string; count: number };
export type Facets = Record<FacetKey, FacetCount[]>;

export type SearchV2Result = {
  tiles: SearchTile[];
  /** Tile count each view would show for the same query and filters. */
  counts: Record<SearchView, number>;
  /** True when the name matched more than SEARCH_V2_CARD_CAP cards. */
  capped: boolean;
  /** No card name contained the query; these come from the trigram fallback. */
  fuzzy: boolean;
  /** Best name match, for card_searches demand logging. Null when nothing matched. */
  topCardId: string | null;
  facets: Facets;
  /** Best-ranked matched cards with no listings, at most SEARCH_V2_PAGE_SIZE. Ignores filters. */
  unlisted: UnlistedCard[];
  /** All matched cards with no listings, within SEARCH_V2_CARD_CAP. */
  unlistedCount: number;
};
