"use client";

import { useRouter } from "next/navigation";
import { setCookie, ONE_YEAR_SECONDS } from "@/lib/utils";
import { createContext, useContext, useEffect, useOptimistic, useTransition } from "react";
import { stickyFilters, toQueryString, FILTERS_COOKIE, LAST_QUERY_COOKIE, VIEW_COOKIE, type SearchState } from "@/lib/search-v2/params";

type SearchNav = {
  /**
   * The state being navigated to, not the one last rendered: controls (checkboxes,
   * chips, sort, view) reflect a click immediately while the server renders the
   * results, which on the production disks can take seconds.
   */
  state: SearchState;
  /** The state the current results were rendered for — lags `state` while pending. */
  rendered: SearchState;
  navigate: (next: SearchState) => void;
  /** True while the server renders the next state — results dim instead of blanking. */
  pending: boolean;
};

const SearchNavContext = createContext<SearchNav | null>(null);

/**
 * The URL is the search state, so navigating is just a push.
 *
 * The view and the carry-over filters are also written to cookies, so they survive
 * a fresh search from the header (which navigates to a bare `/?q=`). A cookie rather than localStorage
 * because the server renders the results — it has to know the view on the first
 * request, not after a client-side redirect.
 */
export function SearchNavProvider({ state, children }: { state: SearchState; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(state);

  // Marks this query as seen, so the demand log in page.tsx skips its refinements.
  useEffect(() => {
    setCookie(LAST_QUERY_COOKIE, encodeURIComponent(state.q));
  }, [state.q]);

  function navigate(next: SearchState) {
    setCookie(VIEW_COOKIE, next.view, ONE_YEAR_SECONDS);
    setCookie(FILTERS_COOKIE, stickyFilters(next), ONE_YEAR_SECONDS);
    startTransition(() => {
      setOptimistic(next);
      router.push(`/?${toQueryString(next)}`, { scroll: false });
    });
  }

  return <SearchNavContext.Provider value={{ state: optimistic, rendered: state, navigate, pending }}>{children}</SearchNavContext.Provider>;
}

export function useSearchNav(): SearchNav {
  const ctx = useContext(SearchNavContext);
  if (!ctx) throw new Error("useSearchNav must be used inside SearchNavProvider");
  return ctx;
}
