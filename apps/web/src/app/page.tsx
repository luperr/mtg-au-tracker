import { searchCards, countCards, PAGE_SIZE } from "@/lib/db";
import { SearchResults } from "./SearchResults";

function SearchForm({ defaultValue, compact }: { defaultValue?: string; compact?: boolean }) {
  return (
    <form method="GET" action="/" className={compact ? "mb-6" : ""}>
      <div className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={defaultValue}
          placeholder="Search cards by name…"
          autoFocus
          className={`flex-1 rounded-lg border border-subtle bg-muted px-4 ${compact ? "py-2" : "py-3"} text-cream placeholder-cream-dim/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent`}
        />
        <button
          type="submit"
          className={`rounded-lg bg-cta ${compact ? "px-5 py-2" : "px-6 py-3"} font-medium text-cream hover:bg-price transition-colors`}
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
          <SearchForm />
        </div>
      </div>
    );
  }

  return (
    <div>
      <SearchForm defaultValue={query} compact />

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
          totalCount={totalCount}
        />
      )}
    </div>
  );
}
