"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export function HeaderSearch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

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
    const q = query.trim();
    if (q) router.push(`/?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards…"
          className="w-full rounded-lg border border-subtle bg-muted px-3 py-1.5 pr-8 text-sm text-cream placeholder:text-cream-dim/40 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-cream-dim/30 hover:text-cream-dim transition-colors text-sm"
          tabIndex={-1}
        >
          →
        </button>
      </div>
    </form>
  );
}
