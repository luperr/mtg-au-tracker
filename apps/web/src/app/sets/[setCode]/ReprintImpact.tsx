"use client";

import type { SetReprintCard } from "@/lib/db";
import { fmtAUD, cardHref } from "@/lib/utils";
import { CardThumb } from "@/app/CardThumb";

const RARITY_BADGE: Record<string, { label: string; class: string }> = {
  mythic:   { label: "M", class: "bg-orange-900/30 text-orange-400 border-orange-900/40" },
  rare:     { label: "R", class: "bg-yellow-900/30 text-yellow-400 border-yellow-900/40" },
  uncommon: { label: "U", class: "bg-blue-900/30 text-blue-300 border-blue-900/40" },
  common:   { label: "C", class: "bg-subtle text-cream-dim border-subtle" },
};

export function ReprintImpact({ cards, setCode, setName }: { cards: SetReprintCard[]; setCode: string; setName: string }) {
  if (cards.length === 0) return null;

  return (
    <div className="rounded-xl border border-subtle bg-surface overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] border-b border-subtle bg-cream-muted/30">
        <div className="px-3 py-2" />
        <div className="px-2 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40">Card</div>
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40 text-right">
          This set
        </div>
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40 text-right hidden sm:block">
          Cheapest other
        </div>
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-cream-dim/40 text-right">
          Diff
        </div>
      </div>

      <div className="divide-y divide-subtle/30">
        {cards.map((card) => {
          const newPrice = card.new_printing_price ? parseFloat(card.new_printing_price) : null;
          const otherPrice = card.other_printing_price ? parseFloat(card.other_printing_price) : null;
          const pct = card.pct_diff ? parseFloat(card.pct_diff) : null;
          const badge = RARITY_BADGE[card.rarity];

          // Negative pct = this set is cheaper (good for buyers), positive = other set is cheaper
          const diffClass =
            pct == null ? "text-cream-dim/30"
            : pct < -5 ? "text-green-400"   // new printing is cheaper
            : pct > 5  ? "text-red-400"     // new printing is more expensive
            : "text-cream-dim/50";

          return (
            <a
              key={card.card_id}
              href={cardHref(card.slug, card.card_id, { code: setCode, name: setName })}
              className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center hover:bg-muted transition-colors group"
            >
              <div className="px-2 py-1.5">
                <CardThumb
                  imageUri={card.image_uri}
                  alt={card.name}
                  className="w-6 h-8 opacity-80 group-hover:opacity-100 transition-opacity"
                />
              </div>
              <div className="px-2 py-1.5 min-w-0 flex items-center gap-1.5">
                {badge && (
                  <span className={`text-[8px] font-bold border rounded px-1 py-0.5 shrink-0 ${badge.class}`}>
                    {badge.label}
                  </span>
                )}
                <span className="text-xs text-cream truncate group-hover:text-accent transition-colors">
                  {card.name}
                </span>
              </div>
              <div className="px-3 py-1.5 text-right">
                <span className="text-xs font-semibold text-price">
                  {newPrice != null ? fmtAUD(newPrice) : "—"}
                </span>
              </div>
              <div className="hidden sm:block px-3 py-1.5 text-right">
                <span className="text-[10px] text-cream-dim/50">
                  {otherPrice != null ? fmtAUD(otherPrice) : "—"}
                </span>
              </div>
              <div className="px-3 py-1.5 text-right w-16">
                <span className={`text-xs font-medium ${diffClass}`}>
                  {pct != null ? `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%` : "—"}
                </span>
              </div>
            </a>
          );
        })}
      </div>

      <div className="px-3 py-2 border-t border-subtle/50 text-[10px] text-cream-dim/30">
        Diff = (this set price − cheapest other printing) ÷ cheapest other printing ·{" "}
        <span className="text-green-400/60">green = new printing is cheaper</span> ·{" "}
        <span className="text-red-400/60">red = older printing is cheaper</span>
      </div>
    </div>
  );
}
