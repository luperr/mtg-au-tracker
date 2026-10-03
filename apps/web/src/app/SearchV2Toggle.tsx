"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SEARCH_V2_COOKIE } from "@/lib/search-v2/params";

/**
 * Header switch between the current search and the v2 (filters + view modes) page.
 * Testing only — it sets a cookie that `/` reads on the server, so flipping it is a
 * refresh, not a rebuild, and nobody sees v2 unless they turn it on.
 */
export function SearchV2Toggle() {
  const router = useRouter();
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(document.cookie.split("; ").includes(`${SEARCH_V2_COOKIE}=1`));
  }, []);

  function toggle() {
    const next = !on;
    document.cookie = next
      ? `${SEARCH_V2_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
      : `${SEARCH_V2_COOKIE}=; path=/; max-age=0; samesite=lax`;
    setOn(next);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      title={on ? "Using new search (beta) — click to switch back" : "Try the new search (beta)"}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        on ? "border-accent bg-accent/20 text-cream" : "border-subtle bg-muted text-cream-dim hover:border-accent hover:text-cream"
      }`}
    >
      {on ? "New search ✓" : "New search"}
    </button>
  );
}
