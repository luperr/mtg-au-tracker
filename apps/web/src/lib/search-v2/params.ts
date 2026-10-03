/**
 * URL state for the v2 search page — every filter, the sort, the view and the page
 * live in search params, so a result set is shareable and indexable. Pure and
 * client-safe: the server parses it to build the query, the client serialises it to
 * navigate.
 *
 * Multi-valued filters are comma-separated (`store=mtg_mate,good_games`); none of
 * the values (store ids, set codes, enum labels) can contain a comma.
 */

export const SEARCH_VIEWS = ["card", "printing", "all"] as const;
export type SearchView = (typeof SEARCH_VIEWS)[number];
export const DEFAULT_VIEW: SearchView = "printing";

export const SEARCH_SORTS = ["price_asc", "price_desc", "name", "set"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
export const DEFAULT_SORT: SearchSort = "price_asc";

export const FACET_KEYS = ["store", "set", "condition", "finish", "treatment"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export type SearchFilters = Record<FacetKey, string[]>;

export type SearchState = {
  q: string;
  view: SearchView;
  sort: SearchSort;
  /** 1-based. */
  page: number;
  filters: SearchFilters;
};

/** Cookie the view toggle writes, so the last choice survives without a URL param. */
export const VIEW_COOKIE = "search_view";

/** Cookie the header toggle writes to opt into the v2 search page. */
export const SEARCH_V2_COOKIE = "search_v2";

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

export function parseSearchParams(params: RawParams, fallbackView?: string): SearchState {
  const filters = {} as SearchFilters;
  for (const key of FACET_KEYS) filters[key] = splitList(first(params[key]));

  const page = parseInt(first(params.page) ?? "1", 10);

  return {
    q: first(params.q)?.trim() ?? "",
    view: oneOf(SEARCH_VIEWS, first(params.view)) ?? oneOf(SEARCH_VIEWS, fallbackView) ?? DEFAULT_VIEW,
    sort: oneOf(SEARCH_SORTS, first(params.sort)) ?? DEFAULT_SORT,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    filters,
  };
}

/** Inverse of parseSearchParams — omits defaults so URLs stay short and canonical. */
export function toQueryString(state: SearchState): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.view !== DEFAULT_VIEW) params.set("view", state.view);
  if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort);
  for (const key of FACET_KEYS) {
    const values = state.filters[key];
    if (values.length) params.set(key, values.join(","));
  }
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

/** Active filters as removable chips. */
export function activeChips(state: SearchState): { key: FacetKey; value: string }[] {
  return FACET_KEYS.flatMap((key) => state.filters[key].map((value) => ({ key, value })));
}

export function clearFilters(state: SearchState): SearchState {
  const filters = {} as SearchFilters;
  for (const key of FACET_KEYS) filters[key] = [];
  return { ...state, page: 1, filters };
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
    normal: "Normal", serialized: "Serialized", borderless: "Borderless", showcase: "Showcase",
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
