"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition } from "react";
import { toQueryString, VIEW_COOKIE, type SearchState } from "@/lib/search-v2/params";

const ONE_YEAR = 60 * 60 * 24 * 365;

type SearchNav = {
  state: SearchState;
  navigate: (next: SearchState) => void;
  /** True while the server renders the next state — results dim instead of blanking. */
  pending: boolean;
};

const SearchNavContext = createContext<SearchNav | null>(null);

/**
 * The URL is the search state, so navigating is just a push.
 *
 * The view is also written to a cookie, so it survives a fresh search from the
 * header (which navigates to a bare `/?q=`). A cookie rather than localStorage
 * because the server renders the results — it has to know the view on the first
 * request, not after a client-side redirect.
 */
export function SearchNavProvider({ state, children }: { state: SearchState; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(next: SearchState) {
    document.cookie = `${VIEW_COOKIE}=${next.view}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    startTransition(() => router.push(`/?${toQueryString(next)}`, { scroll: false }));
  }

  return <SearchNavContext.Provider value={{ state, navigate, pending }}>{children}</SearchNavContext.Provider>;
}

export function useSearchNav(): SearchNav {
  const ctx = useContext(SearchNavContext);
  if (!ctx) throw new Error("useSearchNav must be used inside SearchNavProvider");
  return ctx;
}
