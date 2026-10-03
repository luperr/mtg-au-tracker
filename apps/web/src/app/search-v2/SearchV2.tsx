"use client";

import { toQueryString, type SearchState } from "@/lib/search-v2/params";
import { SEARCH_V2_PAGE_SIZE, type SearchV2Result } from "@/lib/search-v2/types";
import { ListingTile } from "./ListingTile";
import { SearchNavProvider, useSearchNav } from "./SearchNav";
import { SearchToolbar } from "./SearchToolbar";

function Pagination({ total }: { total: number }) {
  const { state } = useSearchNav();
  const pages = Math.ceil(total / SEARCH_V2_PAGE_SIZE);
  if (pages <= 1) return null;

  // Real links rather than buttons, so pages are crawlable and open in new tabs.
  const link = (page: number) => `/?${toQueryString({ ...state, page })}`;
  const cls = "rounded-lg border border-subtle bg-muted px-3 py-1.5 text-sm text-cream-dim hover:border-accent hover:text-cream";

  return (
    <nav className="flex items-center justify-center gap-3 mt-6" aria-label="Pagination">
      {state.page > 1 && <a href={link(state.page - 1)} className={cls}>← Prev</a>}
      <span className="text-sm text-cream-dim">Page {state.page} of {pages}</span>
      {state.page < pages && <a href={link(state.page + 1)} className={cls}>Next →</a>}
    </nav>
  );
}

function Results({ result }: { result: SearchV2Result }) {
  const { state, pending } = useSearchNav();

  return (
    <div className="min-w-0 flex-1">
      <SearchToolbar total={result.total} capped={result.capped} facets={result.facets} onOpenFilters={() => {}} />
      {result.tiles.length === 0 ? (
        <p className="text-cream-dim">No listings match &ldquo;{state.q}&rdquo; with these filters.</p>
      ) : (
        <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 transition-opacity ${pending ? "opacity-50" : ""}`}>
          {result.tiles.map((tile) => (
            <ListingTile key={tile.key} tile={tile} view={state.view} query={state.q} />
          ))}
        </div>
      )}
      <Pagination total={result.total} />
    </div>
  );
}

/** v2 search page, rendered by `/` when the search_v2 cookie is set. */
export function SearchV2({ state, result }: { state: SearchState; result: SearchV2Result }) {
  return (
    <SearchNavProvider state={state}>
      <Results result={result} />
    </SearchNavProvider>
  );
}
