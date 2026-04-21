"use client";

import { useWantList } from "./WantListContext";

export function WantListBadge() {
  const { totalCount } = useWantList();

  return (
    <a
      href="/want-list"
      className="relative flex items-center gap-1.5 rounded-lg border border-subtle bg-muted px-3 py-1.5 text-xs font-medium text-cream-dim hover:text-cream hover:border-accent-border transition-colors sm:px-3 px-2"
    >
      {/* Mobile: filled heart with count inside */}
      <span className="relative sm:hidden text-price leading-none select-none" style={{ fontSize: "1.1rem" }}>
        ♥
        {totalCount > 0 && (
          <span className="absolute inset-0 flex items-center justify-center text-bg font-bold" style={{ fontSize: "0.45rem", paddingTop: "2px" }}>
            {totalCount}
          </span>
        )}
      </span>
      {/* Desktop: heart + label + count beside */}
      <span className="hidden sm:inline">♡</span>
      <span className="hidden sm:inline">Want List</span>
      {totalCount > 0 && (
        <span className="hidden sm:inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-price text-bg text-[10px] font-bold px-1">
          {totalCount}
        </span>
      )}
    </a>
  );
}
