"use client";

import {
  activeChips, clearFilters, facetValueLabel, toggleFilter, FACET_TITLES, SEARCH_SORTS,
  type SearchSort, type SearchView,
} from "@/lib/search-v2/params";
import type { Facets } from "@/lib/search-v2/types";
import { useSearchNav } from "./SearchNav";

const SORT_LABELS: Record<SearchSort, string> = {
  price_asc: "Price: low → high",
  price_desc: "Price: high → low",
  name: "Name",
  set: "Set (newest)",
};

const VIEW_OPTIONS: { view: SearchView; label: string; title: string }[] = [
  { view: "card", label: "Card", title: "One tile per card" },
  { view: "printing", label: "Printing", title: "One tile per printing" },
  { view: "all", label: "All", title: "Every listing" },
];

export function SearchToolbar({
  total, capped, facets, onOpenFilters,
}: {
  total: number;
  capped: boolean;
  facets: Facets;
  /** Opens the filter drawer; the button only shows below md, where the sidebar is hidden. */
  onOpenFilters: () => void;
}) {
  const { state, navigate } = useSearchNav();
  const chips = activeChips(state);

  /** Chip label — store and set ids come back from the facet rows with their display name. */
  function chipLabel(key: (typeof chips)[number]["key"], value: string) {
    const label = facets[key].find((f) => f.value === value)?.label;
    return facetValueLabel(key, value, label);
  }

  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onOpenFilters}
          className="md:hidden rounded-lg border border-subtle bg-muted px-3 py-1.5 text-sm text-cream-dim hover:border-accent hover:text-cream"
        >
          Filters{chips.length > 0 && ` (${chips.length})`}
        </button>

        <p className="text-sm text-cream-dim mr-auto">
          {total.toLocaleString()} result{total === 1 ? "" : "s"}
          {capped && <span className="text-cream-dim/60"> · name matched too many cards, showing the closest</span>}
        </p>

        <div className="flex items-center gap-0.5 rounded-lg border border-subtle bg-muted p-0.5" role="group" aria-label="View">
          {VIEW_OPTIONS.map(({ view, label, title }) => (
            <button
              key={view}
              title={title}
              aria-pressed={state.view === view}
              onClick={() => navigate({ ...state, view, page: 1 })}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                state.view === view ? "bg-surface text-cream shadow-sm" : "text-cream-dim/60 hover:text-cream-dim"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          aria-label="Sort"
          value={state.sort}
          onChange={(e) => navigate({ ...state, sort: e.target.value as SearchSort, page: 1 })}
          className="rounded-lg border border-subtle bg-muted px-2 py-1.5 text-sm text-cream focus:border-accent focus:outline-none"
        >
          {SEARCH_SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
        </select>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map(({ key, value }) => (
            <button
              key={`${key}:${value}`}
              onClick={() => navigate(toggleFilter(state, key, value))}
              aria-label={`Remove ${FACET_TITLES[key]} filter ${chipLabel(key, value)}`}
              className="flex items-center gap-1 rounded-full border border-subtle bg-muted px-2.5 py-0.5 text-xs text-cream hover:border-accent"
            >
              <span className="text-cream-dim/60">{FACET_TITLES[key]}:</span> {chipLabel(key, value)}
              <span aria-hidden className="text-cream-dim/60">×</span>
            </button>
          ))}
          <button onClick={() => navigate(clearFilters(state))} className="text-xs text-cream-dim hover:text-accent">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
