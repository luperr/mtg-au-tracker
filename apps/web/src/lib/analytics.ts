/**
 * Umami custom events — the one place event names and payloads are defined.
 *
 * Every event the app sends is a key of `AnalyticsEvents`, so a typo'd name or a
 * payload missing a field fails typecheck instead of quietly splitting a report.
 * Umami itself is loaded by `app/Analytics.tsx`; only `scrymarket.au` reports
 * (`data-domains`), so dev and preview builds send nothing.
 *
 * Renaming an event or a `source` value splits its history in Umami at the deploy
 * date — prefer adding a field to changing a value.
 */

/** UI surface an event came from. `"search-v2"` is kept for continuity with older events. */
export type Surface = "search-v2" | "card-detail" | "want-list";

export type AnalyticsEvents = {
  /** A new search query rendered results — once per query, not per filter, sort or page. */
  "card-search": { query: string; results: number };
  /** Click from a search tile through to a card page. */
  "card-click": { card: string; source: Surface };
  /** Outbound buy link — fired by `BuyLink`, the only component that renders one. */
  "store-click": { store: string; card: string; price: number; source: Surface };
  /** A listing added to the want list. */
  "want-list-add": { card: string; source: Surface };
  /** A user-initiated want-list change. Moves made by the optimiser are `optimise-run`, not this. */
  "want-list-edit": { action: "remove" | "swap" | "clear"; source: Surface; items?: number };
  /** A filter, sort or view change on the same search query. */
  "search-refine": SearchRefinement;
  /** A card image dragged onto the app started a search. */
  "drag-search": { method: "image-alt" | "text" };
  /**
   * Want-list optimiser run — every run is applied, so this also covers what `optimise-apply`
   * used to. `version: "v2"` separates it from the old optimiser's events in history.
   * `saving` is whole dollars (null when not comparable) — enough to tell nothing from $40.
   */
  "optimise-run":
    | { version: "v2"; lines: number; units: number; stores: number; unavailable: number; alternatives: number; saving: number | null; cached: boolean }
    | { version: "v2"; error: true };
  /** Undo back to the list before the first optimiser run. */
  "optimise-undo": Record<string, never>;
  /** An optimiser preference changed (conditions, max stores, buy-from). */
  "optimise-pref": { pref: string };
  /** A store-count alternative picked from the plan. */
  "optimise-alt": { stores: number | null };
  /** "Don't use this store" on a planned store. */
  "optimise-exclude-store": { store: string };
  /** A card locked to its printing or set back to any; `changed` when picking moved it to another printing. */
  "optimise-line-mode": { mode: "exact" | "any"; changed?: boolean };
  /** "Unlock all" on the want list. */
  "optimise-unlock-all": { cards: number };
  /** Bulk card list looked up on the want list's import panel. */
  "bulk-import":
    | { source: string; cards: number; found: number }
    | { source: string; cards: number; error: true };
};

export type SearchRefinement = {
  kind: "facet-add" | "facet-remove" | "sort" | "view" | "price" | "clear";
  key?: string;
  value?: string;
};

export type AnalyticsEvent = keyof AnalyticsEvents;

type Umami = { track: (event: string, data?: Record<string, unknown>) => void };

declare global {
  interface Window {
    umami?: Umami;
  }
}

/**
 * Events fired before the script has loaded. It loads `afterInteractive`, after
 * hydration — and a search results page fires `card-search` from a mount effect, so
 * without this every search reached by a full page load (landing form, shared link,
 * Google) was dropped. Capped so an ad-blocked script can't grow it without bound.
 */
const MAX_QUEUED = 20;
let queue: [string, Record<string, unknown>][] = [];

export function track<E extends AnalyticsEvent>(event: E, data: AnalyticsEvents[E]): void {
  if (typeof window === "undefined") return;
  const payload = data as Record<string, unknown>;
  if (window.umami) {
    window.umami.track(event, payload);
  } else if (queue.length < MAX_QUEUED) {
    queue.push([event, payload]);
  }
}

/** Sends everything queued before Umami loaded. Called from the script's `onLoad`. */
export function flushQueue(): void {
  const umami = typeof window === "undefined" ? undefined : window.umami;
  if (!umami) return;
  const pending = queue;
  queue = [];
  for (const [event, data] of pending) umami.track(event, data);
}
