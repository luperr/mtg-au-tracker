import { searchCards, countCards } from "@/lib/db";
import { SEARCH_PAGE_SIZE, CACHE_REVALIDATE_HOUR } from "@/lib/config";
import { SearchResults } from "./SearchResults";

export const revalidate = CACHE_REVALIDATE_HOUR;

function LandingSearchForm() {
  return (
    <form method="GET" action="/">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          name="q"
          placeholder="Search cards by name…"
          autoFocus
          className="flex-1 min-w-0 rounded-lg border border-subtle bg-muted px-4 py-3 text-cream placeholder-cream-dim/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-cta px-6 py-3 font-medium text-cream hover:bg-price transition-colors shrink-0"
        >
          Search
        </button>
      </div>
    </form>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const [results, totalCount] = query
    ? await Promise.all([searchCards(query, 0), countCards(query)])
    : [[], 0];

  if (!query) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h1 className="text-4xl font-bold text-cream mb-2">
          The Australian MTG Price Tracker
        </h1>
        <p className="text-cream-dim mb-10 max-w-md">
          Scry before you buy — <b>Actual prices</b> from Australian stores, updated daily
        </p>
        <div className="w-full max-w-lg">
          <LandingSearchForm />
        </div>
      </div>
    );
  }

  return (
    <div>
      {results.length === 0 && (
        <p className="text-cream-dim">
          No cards found for &ldquo;{query}&rdquo;.
        </p>
      )}

      {results.length > 0 && (
        <SearchResults
          initialResults={results}
          query={query}
          initialHasMore={results.length === SEARCH_PAGE_SIZE}
          totalCount={totalCount}
        />
      )}
    </div>
  );
}
