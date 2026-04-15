"use client";

import React, { useMemo } from "react";
import type { SetStoreComparison } from "@/lib/db";
import { fmtAUD } from "@/lib/utils";

export function StoreComparison({
  stores,
  totalCards,
}: {
  stores: SetStoreComparison[];
  totalCards: number;
}) {
  const maxCards = useMemo(
    () => Math.max(...stores.map((s) => s.unique_cards), 1),
    [stores]
  );

  return (
    <div className="rounded-xl border border-subtle bg-surface overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-0">
        {/* Header */}
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40 border-b border-subtle bg-cream-muted/30">
          Store
        </div>
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40 border-b border-subtle bg-cream-muted/30 text-right">
          Avg price
        </div>
        <div className="hidden sm:block px-3 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40 border-b border-subtle bg-cream-muted/30 text-right">
          In stock
        </div>
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40 border-b border-subtle bg-cream-muted/30 text-right">
          Coverage
        </div>

        {/* Rows */}
        {stores.map((store, i) => {
          const avg = store.avg_price ? parseFloat(store.avg_price) : null;
          const coverage =
            totalCards > 0
              ? Math.round((store.unique_cards / totalCards) * 100)
              : 0;
          const barWidth = (store.unique_cards / maxCards) * 100;
          const isBest = i === 0;

          return (
            <React.Fragment key={store.store_id}>
              <div
                className="px-4 py-2.5 flex items-center gap-2 border-b border-subtle/50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-cream truncate">
                      {store.store_name}
                    </span>
                    {isBest && (
                      <span className="text-[9px] bg-accent-muted text-accent-light border border-accent-border rounded px-1 py-0.5 shrink-0">
                        lowest avg
                      </span>
                    )}
                  </div>
                  {/* Coverage bar */}
                  <div className="mt-1 h-0.5 w-24 rounded-full bg-subtle/50 overflow-hidden">
                    <div
                      className="h-full bg-accent/60 rounded-full"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              </div>
              <div
                key={`avg-${store.store_id}`}
                className="px-3 py-2.5 text-right border-b border-subtle/50 flex items-center justify-end"
              >
                <span
                  className={`text-xs font-semibold ${
                    isBest ? "text-price" : "text-cream"
                  }`}
                >
                  {avg != null ? fmtAUD(avg) : "—"}
                </span>
              </div>
              <div
                key={`stock-${store.store_id}`}
                className="hidden sm:flex px-3 py-2.5 text-right border-b border-subtle/50 items-center justify-end"
              >
                <span className="text-xs text-cream-dim/70">
                  {store.in_stock_count.toLocaleString()}
                </span>
              </div>
              <div
                key={`cov-${store.store_id}`}
                className="px-3 py-2.5 text-right border-b border-subtle/50 flex items-center justify-end"
              >
                <span className="text-xs text-cream-dim/70">
                  {coverage}%
                  <span className="text-[10px] text-cream-dim/40 ml-1">
                    ({store.unique_cards}/{totalCards})
                  </span>
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="px-4 py-2 text-[10px] text-cream-dim/40">
        Average price is across all in-stock non-foil listings for this set.
        Coverage = unique cards in stock ÷ total cards in set.
      </div>
    </div>
  );
}
