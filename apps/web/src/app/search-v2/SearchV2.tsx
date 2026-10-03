"use client";

import { toQueryString, type SearchState } from "@/lib/search-v2/params";
import { SEARCH_V2_PAGE_SIZE, type SearchV2Result } from "@/lib/search-v2/types";
import { useEffect, useState } from "react";
import { pillClass } from "@/app/Dropdown";
import { FilterSidebar } from "./FilterSidebar";
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
        <div className="flex items-center justify-between mb-1 px-3">
          <h2 className="text-sm font-semibold text-cream">Filters</h2>
          <button onClick={onClose} aria-label="Close filters" className="text-cream-dim hover:text-cream text-lg leading-none px-1">×</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

/** `rendered` is the state these results were computed for — the nav state may already be ahead of it. */
function Results({ result, rendered }: { result: SearchV2Result; rendered: SearchState }) {
  const { state, pending } = useSearchNav();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex gap-6">
      <aside className="hidden md:block w-56 shrink-0" aria-label="Filters">
        <FilterSidebar facets={result.facets} />
      </aside>
      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <FilterSidebar facets={result.facets} framed={false} />
      </FilterDrawer>

      <div className="min-w-0 flex-1">
        <SearchToolbar total={result.total} capped={result.capped} facets={result.facets} onOpenFilters={() => setDrawerOpen(true)} />
        {result.tiles.length === 0 && result.total > 0 ? (
          <p className="text-cream-dim">
            There&rsquo;s no page {state.page}.{" "}
            <a href={`/?${toQueryString({ ...state, page: 1 })}`} className="text-accent hover:text-accent-light">Back to page 1</a>
          </p>
        ) : result.tiles.length === 0 ? (
          <p className="text-cream-dim">No listings match &ldquo;{state.q}&rdquo; with these filters.</p>
        ) : (
          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 transition-opacity ${pending ? "opacity-50" : ""}`}>
            {result.tiles.map((tile) => (
              <ListingTile key={tile.key} tile={tile} view={rendered.view} query={rendered.q} />
            ))}
          </div>
        )}
        <Pagination total={result.total} />
      </div>
    </div>
  );
}

/** v2 search page, rendered by `/` when the search_v2 cookie is set. */
export function SearchV2({ state, result }: { state: SearchState; result: SearchV2Result }) {
  return (
    <SearchNavProvider state={state}>
      <Results result={result} rendered={state} />
    </SearchNavProvider>
  );
}
