import { searchCards, PAGE_SIZE } from "@/lib/db";
import { SearchResults } from "./SearchResults";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await searchCards(query, 0) : [];

  if (!query) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h1 className="text-4xl font-bold text-cream mb-2">
          The Australian MTG Price Tracker
        </h1>
        <p className="text-cream-dim mb-10 max-w-md">
          Scry before you buy — <b>Actual prices</b> from Australian stores, updated daily
        </p>
        <form method="GET" action="/" className="w-full max-w-lg">
          <div className="flex gap-2">
            <input
              type="text"
              name="q"
              placeholder="Search cards by name…"
              autoFocus
              className="flex-1 rounded-lg border border-subtle bg-muted px-4 py-3 text-cream placeholder-cream-dim/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              className="rounded-lg bg-cta px-6 py-3 font-medium text-cream hover:bg-price transition-colors"
            >
              Search
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      {/* Compact search */}
      <form method="GET" action="/" className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search cards by name…"
            autoFocus
            className="flex-1 rounded-lg border border-subtle bg-muted px-4 py-2 text-cream placeholder-cream-dim/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            className="rounded-lg bg-cta px-5 py-2 font-medium text-cream hover:bg-price transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      {results.length === 0 && (
        <p className="text-cream-dim">
          No cards found for &ldquo;{query}&rdquo;.
        </p>
      )}

      {results.length > 0 && (
        <SearchResults
          initialResults={results}
          query={query}
          initialHasMore={results.length === PAGE_SIZE}
        />
      )}
    </div>
  );
}
