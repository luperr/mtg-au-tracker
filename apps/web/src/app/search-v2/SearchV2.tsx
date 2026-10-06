"use client";

import { activeFilterCount, toQueryString, SIDEBAR_COOKIE, type SearchState } from "@/lib/search-v2/params";
import { setCookie, trackEvent, ONE_YEAR_SECONDS } from "@/lib/utils";
import { SEARCH_V2_PAGE_SIZE, type SearchV2Result } from "@/lib/search-v2/types";
import { useEffect, useState } from "react";
import { pillClass } from "@/app/Dropdown";
import { ClearFiltersButton, FilterSidebar } from "./FilterSidebar";
import { ListingTile } from "./ListingTile";
import { SearchNavProvider, useSearchNav } from "./SearchNav";
import { SearchToolbar } from "./SearchToolbar";

function Pagination({ total }: { total: number }) {
  const { state } = useSearchNav();
  const pages = Math.ceil(total / SEARCH_V2_PAGE_SIZE);
  if (pages <= 1 || state.page > pages) return null;

  // Real links rather than buttons, so pages are crawlable and open in new tabs.
  const link = (page: number) => `/?${toQueryString({ ...state, page })}`;
  const cls = pillClass(false, "rounded-lg");

  return (
    <nav className="flex items-center justify-center gap-3 mt-6" aria-label="Pagination">
      {state.page > 1 && <a href={link(state.page - 1)} className={cls}>← Prev</a>}
      <span className="text-sm text-cream-dim">Page {state.page} of {pages}</span>
      {state.page < pages && <a href={link(state.page + 1)} className={cls}>Next →</a>}
    </nav>
  );
}

/** Below md the sidebar becomes a slide-out drawer behind the toolbar's Filters button. */
function FilterDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <div className={`md:hidden fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-black/60 transition-opacity ${open ? "opacity-100" : "opacity-0"}`} />
      <aside
        role="dialog"
        aria-label="Filters"
        className={`absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto bg-surface border-r border-subtle py-3 transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-1 mb-1 px-3">
          <h2 className="mr-auto text-sm font-semibold text-cream">Filters</h2>
          <ClearFiltersButton />
          <button onClick={onClose} aria-label="Close filters" className="text-cream-dim hover:text-cream text-lg leading-none px-1">×</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

/** `rendered` is the state these results were computed for — the nav state may already be ahead of it. */
function Results({ result, rendered, filtersHidden }: { result: SearchV2Result; rendered: SearchState; filtersHidden: boolean }) {
  const { state, pending } = useSearchNav();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(!filtersHidden);
  const activeCount = activeFilterCount(state);
  const total = result.counts[rendered.view];

  /** Desktop only — below md the sidebar is a drawer. Remembered in a cookie. */
  function setSidebar(open: boolean) {
    setSidebarOpen(open);
    setCookie(SIDEBAR_COOKIE, open ? "" : "hidden", open ? 0 : ONE_YEAR_SECONDS);
  }

  return (
    <div className="flex gap-6">
      {sidebarOpen ? (
        <aside className="hidden md:block w-56 shrink-0" aria-label="Filters">
          <div className="flex items-center gap-1 mb-1.5 pl-1">
            <h2 className="mr-auto text-xs font-medium uppercase tracking-wide text-cream-dim/60">Filters</h2>
            <ClearFiltersButton />
            <button
              onClick={() => setSidebar(false)}
              title="Hide filters"
              aria-label="Hide filters"
              className="rounded px-1.5 text-sm text-cream-dim/60 hover:text-cream hover:bg-muted/40 transition-colors"
            >
              «
            </button>
          </div>
          <FilterSidebar facets={result.facets} />
        </aside>
      ) : (
        <button
          onClick={() => setSidebar(true)}
          title="Show filters"
          aria-label="Show filters"
          className="hidden md:block self-start shrink-0 -mr-3 rounded px-1.5 text-sm text-cream-dim/60 hover:text-cream hover:bg-muted/40 transition-colors"
        >
          »{activeCount > 0 && <span className="ml-1 text-xs text-accent-light">{activeCount}</span>}
        </button>
      )}
      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <FilterSidebar facets={result.facets} framed={false} />
      </FilterDrawer>

      <div className="min-w-0 flex-1">
        <SearchToolbar result={result} onOpenFilters={() => setDrawerOpen(true)} />
        {/* The fuzzy pass only runs when no card name contained the query, so say so —
            otherwise a typo silently returns cards the user never typed. */}
        {result.fuzzy && (
          <p className="mb-4 text-sm text-cream-dim">
            No exact match for &ldquo;{rendered.q}&rdquo;. Showing the closest cards instead.
          </p>
        )}
        {result.tiles.length === 0 && total > 0 ? (
          <p className="text-cream-dim">
            There&rsquo;s no page {state.page}.{" "}
            <a href={`/?${toQueryString({ ...state, page: 1 })}`} className="text-accent hover:text-accent-light">Back to page 1</a>
          </p>
        ) : result.tiles.length === 0 ? (
          <p className="text-cream-dim">No listings match &ldquo;{state.q}&rdquo; with these filters.</p>
        ) : (
          <div className={`grid grid-cols-2 sm:grid-cols-3 ${sidebarOpen ? "lg:grid-cols-4" : "lg:grid-cols-5"} gap-3 transition-opacity ${pending ? "opacity-50" : ""}`}>
            {result.tiles.map((tile) => (
              <ListingTile key={tile.key} tile={tile} view={rendered.view} query={rendered.q} />
            ))}
          </div>
        )}
        <Pagination total={total} />
      </div>
    </div>
  );
}

/** v2 search page, rendered by `/` when the search_v2 cookie is set. */
export function SearchV2({ state, result, filtersHidden = false }: { state: SearchState; result: SearchV2Result; filtersHidden?: boolean }) {
  // One event per query, not per filter or page change — same as v1's card-search.
  useEffect(() => {
    trackEvent("card-search", { query: state.q, search: "v2" });
  }, [state.q]);

  return (
    <SearchNavProvider state={state}>
      <Results result={result} rendered={state} filtersHidden={filtersHidden} />
    </SearchNavProvider>
  );
}
