"use client";

import { useEffect, useRef } from "react";
import { SearchPendingBar, Spinner, useSearchSubmit } from "./useSearchSubmit";

/**
 * The landing search box. A plain GET form, so it works before hydration; once the page is
 * interactive it navigates in-app instead — no full reload, which on a phone also skips
 * re-downloading and re-parsing the page's JavaScript — and shows that it's searching.
 *
 * Focused on load only with a fine pointer (mouse, trackpad). `autoFocus` on a phone opens the
 * keyboard before the visitor has done anything, covering half the screen.
 */
export function LandingSearchForm() {
  const input = useRef<HTMLInputElement>(null);
  const { submit, pending } = useSearchSubmit();

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit(input.current?.value ?? "");
  }

  return (
    <form method="GET" action="/" role="search" onSubmit={handleSubmit}>
      <SearchPendingBar active={pending} />
      <div className="flex gap-2">
        <input
          ref={input}
          type="text"
          name="q"
          enterKeyHint="search"
          aria-busy={pending}
          aria-label="Search cards by name"
          placeholder="Search cards by name…"
          className="flex-1 min-w-0 rounded-lg border border-subtle bg-muted px-4 py-3 text-cream placeholder-cream-dim/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          className="flex shrink-0 items-center gap-2 rounded-lg bg-cta px-4 sm:px-6 py-3 font-medium text-cream hover:bg-price transition-colors"
        >
          {pending && <Spinner />}
          {pending ? "Searching…" : "Search"}
        </button>
      </div>
    </form>
  );
}
