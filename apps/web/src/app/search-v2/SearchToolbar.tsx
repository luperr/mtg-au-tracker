"use client";

import { activeFilterCount, SEARCH_SORTS, type SearchSort, type SearchView } from "@/lib/search-v2/params";
import type { SearchV2Result } from "@/lib/search-v2/types";
import { Dropdown, OptionItem, pillClass } from "@/app/Dropdown";
import { useSearchNav } from "./SearchNav";

const SORT_LABELS: Record<SearchSort, string> = {
  price_asc: "Price: low → high",
  price_desc: "Price: high → low",
  name: "Name",
  set: "Set (newest)",
};

const VIEW_TABS: { view: SearchView; label: string; title: string }[] = [
  { view: "card", label: "Cards", title: "One tile per card, at its cheapest listing" },
  { view: "printing", label: "Printings", title: "One tile per printing, at its cheapest listing" },
  { view: "listings", label: "Listings", title: "Every listing" },
];

export function SearchToolbar({
  result, onOpenFilters,
}: {
  result: Pick<SearchV2Result, "counts" | "capped">;
  /** Opens the filter drawer; the button only shows below md, where the sidebar is hidden. */
  onOpenFilters: () => void;
}) {
  const { state, navigate } = useSearchNav();
  const activeCount = activeFilterCount(state);

  return (
    // Phones: sticky under the scroll, so Filters and Sort stay reachable down a long result list.
    <div className="flex flex-col gap-2 mb-4 sticky top-0 z-30 -mx-4 px-4 py-2 bg-bg/95 backdrop-blur sm:static sm:z-auto sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none">
      {/* Phones: Filters · count · Sort on one row, the view tabs full width below. sm+: one row. */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onOpenFilters} className={`md:hidden ${pillClass(activeCount > 0)}`}>
          Filters{activeCount > 0 && ` (${activeCount})`}
        </button>

        {/* What a tile is. Each option's count doubles as the result count for that view. */}
        <span className="sm:hidden mr-auto text-xs text-cream-dim tabular-nums">
          {result.counts[state.view].toLocaleString()} result{result.counts[state.view] === 1 ? "" : "s"}
        </span>

        <div className="order-last w-full grid grid-cols-3 sm:order-none sm:w-auto sm:flex items-center gap-0.5 rounded-lg border border-subtle bg-muted p-0.5 sm:mr-auto" role="group" aria-label="View">
          {VIEW_TABS.map(({ view, label, title }) => (
            <button
              key={view}
              title={title}
              aria-pressed={state.view === view}
              onClick={() => navigate({ ...state, view, page: 1 })}
              className={`rounded px-2 py-2 sm:py-1 text-xs transition-colors ${
                state.view === view ? "bg-surface text-cream shadow-sm" : "text-cream-dim/60 hover:text-cream-dim"
              }`}
            >
              {label} <span className="tabular-nums opacity-60">{result.counts[view].toLocaleString()}</span>
            </button>
          ))}
        </div>

        <Dropdown label="Sort" active={state.sort !== "price_asc"} align="right" rounded>
          <div className="py-1">
            {SEARCH_SORTS.map((sort) => (
              <OptionItem
                key={sort}
                label={SORT_LABELS[sort]}
                checked={state.sort === sort}
                onClick={() => navigate({ ...state, sort, page: 1 })}
              />
            ))}
          </div>
        </Dropdown>
      </div>

      {result.capped && (
        <p className="text-xs text-cream-dim/60">The name matched too many cards — showing the closest matches.</p>
      )}

    </div>
  );
}
