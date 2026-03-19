"use client";

import { useBuyList } from "./BuyListContext";

export function BuyListBadge() {
  const { totalCount } = useBuyList();

  return (
    <a
      href="/buy-list"
      className="relative flex items-center gap-1.5 rounded-lg border border-subtle bg-muted px-3 py-1.5 text-xs font-medium text-cream-dim hover:text-cream hover:border-accent-border transition-colors"
    >
      Buy List
      {totalCount > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-price text-bg text-[10px] font-bold px-1">
          {totalCount}
        </span>
      )}
    </a>
  );
}
