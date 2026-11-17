"use client";

import { useEffect, useState } from "react";

/** Below Tailwind's `sm` breakpoint — the phone layouts. */
export const MOBILE_QUERY = "(max-width: 639.98px)";

/**
 * Tracks a CSS media query. False on the server and the first client render, so markup
 * matches during hydration — use it for what happens on interaction (sheet vs dropdown),
 * and plain responsive classes for anything visible on first paint.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
