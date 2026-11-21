"use client";

import { activeFilterCount, toQueryString, SIDEBAR_COOKIE, type SearchState } from "@/lib/search-v2/params";
import { setCookie, ONE_YEAR_SECONDS } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { SEARCH_V2_PAGE_SIZE, type SearchV2Result } from "@/lib/search-v2/types";
import { useEffect, useState } from "react";
import { Sheet } from "@/app/Sheet";
import { pillClass } from "@/app/Dropdown";
import { ClearFiltersButton, FilterSidebar } from "./FilterSidebar";
import { ListingTile, UnlistedTile } from "./ListingTile";
import { SearchNavProvider, useSearchNav } from "./SearchNav";
import { SearchToolbar } from "./SearchToolbar";

function Pagination({ total }: { total: number }) {
  const { state } = useSearchNav();
  const pages = Math.ceil(total / SEARCH_V2_PAGE_SIZE);
  if (pages <= 1 || state.page > pages) return null;

  // Real links rather than buttons, so pages are crawlable and open in new tabs.
  const link = (page: number) => `/?${toQueryString({ ...state, page })}`;
  const cls = `${pillClass(false, "rounded-lg")} inline-flex items-center min-h-11 sm:min-h-0`;

  return (
    <nav className="flex items-center justify-center gap-3 mt-6" aria-label="Pagination">
      {state.page > 1 && <a href={link(state.page - 1)} className={cls}>← Prev</a>}
      <span className="text-sm text-cream-dim">Page {state.page} of {pages}</span>
      {state.page < pages && <a href={link(state.page + 1)} className={cls}>Next →</a>}
    </nav>
  );
}

/** Below md the sidebar becomes a slide-out drawer behind the toolbar's Filters button. */
function FilterDrawer({ open, onClose, total, pending, children }: {
  open: boolean;
  onClose: () => void;
  /** Result count for the state last rendered — the drawer covers the results, so this is the only feedback a tap gets. */
  total: number;
  pending: boolean;
  children: React.ReactNode;
}) {
  const footer = (
    <button onClick={onClose} className={`flex h-11 w-full items-center justify-center rounded-lg bg-cta font-medium text-cream transition-opacity ${pending ? "opacity-60" : ""}`}>
      {pending ? "Updating…" : `Show ${total.toLocaleString()} result${total === 1 ? "" : "s"}`}
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} side="left" title="Filters" actions={<ClearFiltersButton />} footer={footer} className="md:hidden">
      {children}
    </Sheet>
  );
}

/** `rendered` is the state these results were computed for — the nav state may already be ahead of it. */
function Results({ result, rendered, filtersHidden }: { result: SearchV2Result; rendered: SearchState; filtersHidden: boolean }) {
  const { state, pending } = useSearchNav();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(!filtersHidden);
  const activeCount = activeFilterCount(state);
  const total = result.counts[rendered.view];
  const gridClass = `grid grid-cols-2 sm:grid-cols-3 ${sidebarOpen ? "lg:grid-cols-4" : "lg:grid-cols-5"} gap-3 transition-opacity ${pending ? "opacity-50" : ""}`;
  // Unlisted cards trail the listings, so they belong on the last page only.
  const showUnlisted = result.unlisted.length > 0 && rendered.page >= Math.ceil(total / SEARCH_V2_PAGE_SIZE);

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
      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} total={total} pending={pending}>
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
          // With no filters, the unlisted section below already says why nothing is listed.
          (activeCount > 0 || !showUnlisted) && (
            <p className="text-cream-dim">No listings match &ldquo;{state.q}&rdquo;{activeCount > 0 && " with these filters"}.</p>
          )
        ) : (
          <div className={gridClass}>
            {result.tiles.map((tile, i) => (
              // The first row is on screen at load (2 columns on a phone, up to 5 on desktop).
              <ListingTile key={tile.key} tile={tile} view={rendered.view} query={rendered.q} priority={i < 4} />
            ))}
          </div>
        )}
        <Pagination total={total} />
        {showUnlisted && (
          <section className="mt-8" aria-labelledby="unlisted-heading">
            <h2 id="unlisted-heading" className="mb-1 text-xs font-medium uppercase tracking-wide text-cream-dim/60">
              No listings yet <span className="tabular-nums opacity-60">{result.unlistedCount.toLocaleString()}</span>
            </h2>
            <p className="mb-3 text-sm text-cream-dim">
              Cards matching &ldquo;{rendered.q}&rdquo; that no store has in stock, including sets not yet released.
              {result.unlistedCount > result.unlisted.length && ` Showing the closest ${result.unlisted.length}.`}
            </p>
            <div className={gridClass}>
              {result.unlisted.map((card) => (
                <UnlistedTile key={card.card_id} card={card} query={rendered.q} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** The search results page, rendered by `/` for any query of SEARCH_MIN_QUERY_LENGTH or more. */
export function SearchV2({ state, result, newQuery, filtersHidden = false }: {
  state: SearchState;
  result: SearchV2Result;
  /**
   * The server's call, from LAST_QUERY_COOKIE, on whether this render is a new query
   * or a refinement of the last one — the same test that gates the card_searches log,
   * so Umami and the DB count the same searches. Deciding it here instead fails on
   * pagination: those links are full page loads, which remount this component.
   */
  newQuery: boolean;
  filtersHidden?: boolean;
}) {
  useEffect(() => {
    if (newQuery) track("card-search", { query: state.q, results: result.counts.card });
    // Keyed on the query alone: a refinement re-renders with a new result count, which isn't a new search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.q, newQuery]);

  return (
    <SearchNavProvider state={state}>
      <Results result={result} rendered={state} filtersHidden={filtersHidden} />
    </SearchNavProvider>
  );
}
