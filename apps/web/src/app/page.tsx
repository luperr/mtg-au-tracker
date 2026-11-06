import { logCardSearch } from "@/lib/db";
import { SEARCH_MIN_QUERY_LENGTH } from "@/lib/config";
import { cookies } from "next/headers";
import { parseSearchParams, FILTERS_COOKIE, LAST_QUERY_COOKIE, SIDEBAR_COOKIE, VIEW_COOKIE } from "@/lib/search-v2/params";
import { searchListings } from "@/lib/search-v2/query";
import { SearchV2 } from "./search-v2/SearchV2";
import { LandingNotices } from "./LandingNotices";

// Next.js route segment config — must be a static literal, not an imported variable
export const revalidate = 3600;

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

/** The cookie is written URI-encoded; compare both forms in case the framework already decoded it. */
function sameQuery(cookie: string | undefined, q: string): boolean {
  if (cookie === undefined) return false;
  if (cookie === q) return true;
  try {
    return decodeURIComponent(cookie) === q;
  } catch {
    return false;
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = q?.trim() ?? "";
  const tooShort = query.length > 0 && query.length < SEARCH_MIN_QUERY_LENGTH;

  // Only reached with a query: v2 requires one (see searchListings()).
  if (query && !tooShort) {
    const jar = await cookies();
    const state = parseSearchParams(params, jar.get(VIEW_COOKIE)?.value, jar.get(FILTERS_COOKIE)?.value);
    const result = await searchListings(state);
    // Logged once per new query: every filter, sort, view and
    // page change re-renders this route too, for the query LAST_QUERY_COOKIE already holds.
    if (!sameQuery(jar.get(LAST_QUERY_COOKIE)?.value, state.q)) {
      logCardSearch(state.q, result.topCardId);
    }
    return <SearchV2 state={state} result={result} filtersHidden={jar.get(SIDEBAR_COOKIE)?.value === "hidden"} />;
  }

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
          <LandingNotices />
        </div>
      </div>
    );
  }

  return (
    <p className="text-cream-dim">
      Enter at least {SEARCH_MIN_QUERY_LENGTH} characters to search.
    </p>
  );
}
