/**
 * URL state for the v2 search page — every filter, the sort, the view and the page
 * live in search params, so a result set is shareable and indexable. Pure and
 * client-safe: the server parses it to build the query, the client serialises it to
 * navigate.
 *
 * Multi-valued filters are comma-separated (`store=mtg_mate,good_games`); none of
 * the values (store ids, set codes, enum labels) can contain a comma.
 */

export const SEARCH_VIEWS = ["card", "printing", "listings"] as const;
export type SearchView = (typeof SEARCH_VIEWS)[number];
export const DEFAULT_VIEW: SearchView = "printing";

export const SEARCH_SORTS = ["price_asc", "price_desc", "name", "set"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
export const DEFAULT_SORT: SearchSort = "price_asc";

export const FACET_KEYS = ["store", "set", "condition", "finish", "treatment"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export type SearchFilters = Record<FacetKey, string[]>;

/** AUD bounds, inclusive. Either side may be open. */
export type PriceRange = { min: number | null; max: number | null };

export type SearchState = {
  q: string;
  view: SearchView;
  sort: SearchSort;
  /** 1-based. */
  page: number;
  filters: SearchFilters;
  price: PriceRange;
};

/**
 * Price filters a listing, so it only means something where a tile *is* one listing's
 * price — printing and listing views. In card view the tile is the card's cheapest
 * listing across every printing, where a range is rarely what anyone wants; the
 * control is hidden there and any range in the URL is kept but not applied.
 */
export function priceFilterApplies(state: SearchState): boolean {
  return state.view !== "card" && hasPrice(state);
}

function hasPrice(state: SearchState): boolean {
  return state.price.min !== null || state.price.max !== null;
}

/**
 * Treatment values that are the default rather than a choice. Unticked already
 * means "any", so offering "Normal" as an option only adds noise.
 */
export const DEFAULT_TREATMENT = "normal";

/** Cookie the view toggle writes, so the last choice survives without a URL param. */
export const VIEW_COOKIE = "search_view";

/** Cookie set to "hidden" when the desktop filter sidebar is collapsed — read server-side so it never flashes open. */
export const SIDEBAR_COOKIE = "search_sidebar";

/**
 * Cookie holding the filters that carry over to the next search, as a query string.
 * New searches (header box, drag-and-drop) navigate to a bare `/?q=`, so the server
 * falls back to this whenever the URL names no filter at all.
 */
export const FILTERS_COOKIE = "search_filters";

/**
 * Session cookie holding the query the results page last rendered, so the server can
 * tell a new search from a filter, sort, view or page change on the same one — the
 * URL can't, since toQueryString() drops defaults and a cleared filter leaves a bare
 * `/?q=` just like a fresh search.
 */
export const LAST_QUERY_COOKIE = "search_last_q";

/**
 * Facets that carry across searches. Set is left out: it describes the card that was
 * searched, so carried into a different name it would mostly empty the results.
 */
const STICKY_KEYS: FacetKey[] = ["store", "condition", "finish", "treatment"];
const FILTER_PARAMS = [...FACET_KEYS, "min", "max"];

/**
 * Cookie the header toggle writes: "1" opts into the v2 search page, "0" opts out.
 * Absent, the site default applies (SEARCH_V2_DEFAULT — see searchV2Default()).
 */
export const SEARCH_V2_COOKIE = "search_v2";

/** Whether `/` renders v2: an explicit choice in the cookie wins, otherwise the default. */
export function searchV2Enabled(cookie: string | undefined, defaultOn: boolean): boolean {
  return cookie === "1" || (cookie !== "0" && defaultOn);
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function oneOf<T extends string>(values: readonly T[], v: string | undefined): T | undefined {
  return values.includes(v as T) ? (v as T) : undefined;
}

function splitList(v: string | undefined): string[] {
  if (!v) return [];
  // Dedupe and drop empties so `store=a,,a` can't change the cache key or the SQL.
  return [...new Set(v.split(",").map((s) => s.trim()).filter(Boolean))];
}

/** A non-negative price rounded to cents, or null for anything else (empty, junk, negative). */
export function parsePrice(v: string | undefined): number | null {
  if (!v?.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * `fallbackView` and `fallbackFilters` are the cookie-remembered view and filters,
 * used only when the URL doesn't name its own.
 */
export function parseSearchParams(params: RawParams, fallbackView?: string, fallbackFilters?: string): SearchState {
  if (fallbackFilters && !FILTER_PARAMS.some((k) => first(params[k]))) {
    params = { ...Object.fromEntries(new URLSearchParams(fallbackFilters)), ...params };
  }
  const filters = {} as SearchFilters;
  for (const key of FACET_KEYS) filters[key] = splitList(first(params[key]));
  filters.treatment = filters.treatment.filter((t) => t !== DEFAULT_TREATMENT);

  const page = parseInt(first(params.page) ?? "1", 10);
  let min = parsePrice(first(params.min));
  let max = parsePrice(first(params.max));
  // A reversed range is a typo, not a request for nothing.
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  return {
    q: first(params.q)?.trim() ?? "",
    view: oneOf(SEARCH_VIEWS, first(params.view)) ?? oneOf(SEARCH_VIEWS, fallbackView) ?? DEFAULT_VIEW,
    sort: oneOf(SEARCH_SORTS, first(params.sort)) ?? DEFAULT_SORT,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    filters,
    price: { min, max },
  };
}

/** Inverse of parseSearchParams — omits defaults so URLs stay short and canonical. */
/** Writes `keys`' filter values and the price range — the URL and FILTERS_COOKIE share this. */
function appendFilters(params: URLSearchParams, state: SearchState, keys: readonly FacetKey[]): void {
  for (const key of keys) if (state.filters[key].length) params.set(key, state.filters[key].join(","));
  if (state.price.min !== null) params.set("min", String(state.price.min));
  if (state.price.max !== null) params.set("max", String(state.price.max));
}

export function toQueryString(state: SearchState): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.view !== DEFAULT_VIEW) params.set("view", state.view);
  if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort);
  appendFilters(params, state, FACET_KEYS);
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}

/**
 * Next state after toggling one filter value. Any filter change goes back to page 1 —
 * the old page number means nothing against a different result set.
 */
export function toggleFilter(state: SearchState, key: FacetKey, value: string): SearchState {
  const current = state.filters[key];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...state, page: 1, filters: { ...state.filters, [key]: next } };
}

/**
 * Ticked facet values plus a price range — the Filters badge count. Price counts even in
 * card view, where it isn't applied: it's still remembered and carried to the next
 * search, so Clear has to stay reachable.
 */
export function activeFilterCount(state: SearchState): number {
  return FACET_KEYS.reduce((n, key) => n + state.filters[key].length, 0) + (hasPrice(state) ? 1 : 0);
}

/** The carry-over part of the state, for FILTERS_COOKIE. Already cookie-safe: URLSearchParams escapes `,` `;` and spaces. */
export function stickyFilters(state: SearchState): string {
  const params = new URLSearchParams();
  appendFilters(params, state, STICKY_KEYS);
  return params.toString();
}

export function clearFilters(state: SearchState): SearchState {
  const filters = {} as SearchFilters;
  for (const key of FACET_KEYS) filters[key] = [];
  return { ...state, page: 1, filters, price: { min: null, max: null } };
}

export function setPrice(state: SearchState, price: PriceRange): SearchState {
  return { ...state, page: 1, price };
}

// ─── Display ──────────────────────────────────────────────────────────────────

export const FACET_TITLES: Record<FacetKey, string> = {
  store: "Store",
  set: "Set",
  condition: "Condition",
  finish: "Finish",
  treatment: "Treatment",
};

const VALUE_LABELS: Partial<Record<FacetKey, Record<string, string>>> = {
  finish: { nonfoil: "Non-foil", foil: "Foil", etched: "Etched" },
  treatment: {
    serialized: "Serialized", borderless: "Borderless", showcase: "Showcase",
    extendedart: "Extended Art", retro: "Retro Frame", fullart: "Full Art",
  },
  condition: { unknown: "Unknown" },
};

/** Human label for a facet value. `label` is the DB-provided name (store/set name), when there is one. */
export function facetValueLabel(key: FacetKey, value: string, label?: string): string {
  const mapped = VALUE_LABELS[key]?.[value];
  if (mapped) return mapped;
  return label ?? value;
}
