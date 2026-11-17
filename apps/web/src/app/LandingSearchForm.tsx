"use client";

import { useEffect, useRef } from "react";

/**
 * The landing search box. A plain GET form, so it works before hydration.
 *
 * Focused on load only with a fine pointer (mouse, trackpad). `autoFocus` on a phone opens the
 * keyboard before the visitor has done anything, covering half the screen.
 */
export function LandingSearchForm() {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, []);

  return (
    <form method="GET" action="/" role="search">
      <div className="flex gap-2">
        <input
          ref={input}
          type="text"
          name="q"
          enterKeyHint="search"
          aria-label="Search cards by name"
          placeholder="Search cards by name…"
          className="flex-1 min-w-0 rounded-lg border border-subtle bg-muted px-4 py-3 text-base text-cream placeholder-cream-dim/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-cta px-4 sm:px-6 py-3 font-medium text-cream hover:bg-price transition-colors shrink-0"
        >
          Search
        </button>
      </div>
    </form>
  );
}
