"use client";

import type { SymbioticMover } from "@/lib/db";
import { fmtAUD, cardHref } from "@/lib/utils";
import { CardThumb } from "@/app/CardThumb";

export function SymbioticMovers({ movers, setCode }: { movers: SymbioticMover[]; setCode: string }) {
  if (movers.length === 0) return null;

  return (
    <div className="rounded-xl border border-subtle bg-surface overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] border-b border-subtle bg-cream-muted/30">
        <div className="px-3 py-2" />
        <div className="px-2 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40">Card</div>
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40 text-right hidden sm:block">
          At release
        </div>
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40 text-right">
          Now
        </div>
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40 text-right">
          Gain
        </div>
      </div>

      <div className="divide-y divide-subtle/30">
        {movers.map((card) => {
          const first = parseFloat(card.first_price);
          const current = parseFloat(card.current_price);
          const pct = parseFloat(card.pct_change);

          return (
            <a
              key={card.card_id}
              href={cardHref(card.slug, card.card_id)}
              className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center hover:bg-muted transition-colors group"
            >
              <div className="px-2 py-1.5">
                <CardThumb
                  imageUri={card.image_uri}
                  alt={card.name}
                  className="w-6 h-8 opacity-80 group-hover:opacity-100 transition-opacity"
                />
              </div>
              <div className="px-2 py-1.5 min-w-0">
                <span className="text-xs text-cream truncate block group-hover:text-accent transition-colors">
                  {card.name}
                </span>
              </div>
              <div className="hidden sm:block px-3 py-1.5 text-right">
                <span className="text-[10px] text-cream-dim/50">{fmtAUD(first)}</span>
              </div>
              <div className="px-3 py-1.5 text-right">
                <span className="text-xs font-semibold text-price">{fmtAUD(current)}</span>
              </div>
              <div className="px-3 py-1.5 text-right w-16">
                <span className="text-xs font-medium text-red-400">
                  +{pct.toFixed(0)}%
                </span>
              </div>
            </a>
          );
        })}
      </div>

      <div className="px-3 py-2 border-t border-subtle/50 text-[10px] text-cream-dim/30">
        Cards not in this set that increased ≥15% since release · may indicate set-driven demand
      </div>
    </div>
  );
}
