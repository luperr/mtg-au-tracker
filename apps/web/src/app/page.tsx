import { logCardSearch } from "@/lib/db";
import { SEARCH_MIN_QUERY_LENGTH } from "@/lib/config";
import { cookies } from "next/headers";
import { parseSearchParams, FILTERS_COOKIE, LAST_QUERY_COOKIE, SIDEBAR_COOKIE, VIEW_COOKIE } from "@/lib/search-v2/params";
import { searchListings } from "@/lib/search-v2/query";
import { SearchV2 } from "./search-v2/SearchV2";
import { LandingNotices } from "./LandingNotices";
import { LandingSearchForm } from "./LandingSearchForm";

// Next.js route segment config — must be a static literal, not an imported variable
export const revalidate = 3600;

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
    const newQuery = !sameQuery(jar.get(LAST_QUERY_COOKIE)?.value, state.q);
    if (newQuery) logCardSearch(state.q, result.topCardId);
    return <SearchV2 state={state} result={result} newQuery={newQuery} filtersHidden={jar.get(SIDEBAR_COOKIE)?.value === "hidden"} />;
  }

  if (!query) {
    return (
      // Phones: start near the top. Centring in 60vh pushed the box down to where the
      // keyboard covers it. sm+ keeps the centred hero.
      <div className="flex flex-col items-center pt-4 sm:pt-0 sm:justify-center sm:min-h-[60vh] text-center">
        <h1 className="text-2xl sm:text-4xl font-bold text-cream mb-2 text-balance">
          The Australian MTG Price Tracker
        </h1>
        <p className="text-sm sm:text-base text-cream-dim mb-6 sm:mb-10 max-w-md text-balance">
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
