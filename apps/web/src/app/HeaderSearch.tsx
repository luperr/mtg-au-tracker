"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { SearchPendingBar, Spinner, useSearchSubmit } from "./useSearchSubmit";

export function HeaderSearch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { submit, pending } = useSearchSubmit();

  const urlQuery = pathname === "/" ? (searchParams.get("q") ?? "") : "";
  const [query, setQuery] = useState(urlQuery);

  // Sync input when the URL query changes (e.g. back/forward navigation)
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  // Hide on the landing page (no active query)
  if (pathname === "/" && !urlQuery) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(query);
  }

  return (
    <form onSubmit={handleSubmit} role="search" className="w-full max-w-sm">
      <SearchPendingBar active={pending} />
      <div className="relative">
        <input
          type="text"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-busy={pending}
          aria-label="Search cards"
          placeholder="Search cards…"
          className="w-full rounded-lg border border-subtle bg-muted px-3 py-2 sm:py-1.5 pr-8 text-sm text-cream placeholder:text-cream-dim/40 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          aria-label={pending ? "Searching" : "Search"}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-cream-dim/30 hover:text-cream-dim transition-colors text-sm"
          tabIndex={-1}
        >
          {pending ? <Spinner className="text-accent-light" /> : "→"}
        </button>
      </div>
    </form>
  );
}
