"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { searchV2Enabled, SEARCH_V2_COOKIE } from "@/lib/search-v2/params";
import { setCookie, ONE_YEAR_SECONDS } from "@/lib/utils";

/**
 * Header switch between the current search and the v2 (filters + view modes) page.
 * It sets a cookie that `/` reads on the server, so flipping it is a refresh, not a
 * rebuild. `defaultOn` is SEARCH_V2_DEFAULT, read by the layout on the server.
 */
export function SearchV2Toggle({ defaultOn }: { defaultOn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(defaultOn);

  useEffect(() => {
    const cookie = document.cookie.split("; ").find((c) => c.startsWith(`${SEARCH_V2_COOKIE}=`))?.split("=")[1];
    setOn(searchV2Enabled(cookie, defaultOn));
  }, [defaultOn]);

  /** Always an explicit "1" or "0", so an opt-out survives the default being flipped later. */
  function toggle() {
    const next = !on;
    setCookie(SEARCH_V2_COOKIE, next ? "1" : "0", ONE_YEAR_SECONDS);
    setOn(next);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      title={on ? "Using new search (beta) — click to switch back" : "Try the new search (beta)"}
      aria-label={on ? "Switch back to the current search" : "Try the new search (beta)"}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        on ? "border-accent bg-accent/20 text-cream" : "border-subtle bg-muted text-cream-dim hover:border-accent hover:text-cream"
      }`}
    >
      {/* Compact below sm — the full label squeezed the header search to a few characters. */}
      <span className="sm:hidden">{on ? "β ✓" : "β"}</span>
      <span className="hidden sm:inline">{on ? "New search ✓" : "New search"}</span>
    </button>
  );
}
