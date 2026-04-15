"use client";

import { useMemo } from "react";
import type { SetCardPerf } from "@/lib/db";
import { fmtAUD } from "@/lib/utils";
import { cardHref } from "@/lib/utils";

const RARITY_COLOR: Record<string, string> = {
  mythic: "text-orange-400",
  rare: "text-yellow-400",
  uncommon: "text-blue-300",
  common: "text-cream-dim",
};

const RARITY_LABEL: Record<string, string> = {
  mythic: "M",
  rare: "R",
  uncommon: "U",
  common: "C",
};

const TOP_N = 8;

function CardRow({
  card,
  isGainer,
}: {
  card: SetCardPerf;
  isGainer: boolean;
}) {
  const pct = card.pct_change != null ? parseFloat(card.pct_change) : null;
  const first = card.first_price != null ? parseFloat(card.first_price) : null;
  const current = card.current_price != null ? parseFloat(card.current_price) : null;
  const maxBarPct = 100;
  const barWidth = pct != null ? Math.min(Math.abs(pct), maxBarPct) : 0;

  return (
    <a
      href={cardHref(card.slug, card.card_id)}
      className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors"
    >
      {/* Card thumbnail */}
      {card.image_uri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image_uri}
          alt={card.name}
          width={28}
          height={39}
          className="rounded shrink-0 opacity-90 group-hover:opacity-100 transition-opacity"
          loading="lazy"
        />
      ) : (
        <div className="w-7 h-10 rounded bg-subtle shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[9px] font-bold rounded px-1 py-0.5 bg-subtle ${RARITY_COLOR[card.rarity] ?? "text-cream-dim"}`}
          >
            {RARITY_LABEL[card.rarity] ?? "?"}
          </span>
          <span className="text-xs font-medium text-cream truncate group-hover:text-accent transition-colors">
            {card.name}
          </span>
        </div>
        {/* Bar */}
        <div className="mt-1 h-1 rounded-full bg-subtle/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isGainer ? "bg-red-500/70" : "bg-green-500/70"
            }`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      <div className="text-right shrink-0">
        <div
          className={`text-xs font-bold ${
            isGainer ? "text-red-400" : "text-green-400"
          }`}
        >
          {pct != null
            ? `${isGainer ? "+" : ""}${pct.toFixed(0)}%`
            : "—"}
        </div>
        <div className="text-[10px] text-cream-dim/40">
          {first != null && current != null
            ? `${fmtAUD(first)} → ${fmtAUD(current)}`
            : "—"}
        </div>
      </div>
    </a>
  );
}

export function WinnersLosersBoard({
  cardPerf,
  setCode,
}: {
  cardPerf: SetCardPerf[];
  setCode: string;
}) {
  const gainers = useMemo(
    () =>
      [...cardPerf]
        .filter((c) => c.pct_change != null && parseFloat(c.pct_change) > 0)
        .sort((a, b) => parseFloat(b.pct_change!) - parseFloat(a.pct_change!))
        .slice(0, TOP_N),
    [cardPerf]
  );

  const losers = useMemo(
    () =>
      [...cardPerf]
        .filter((c) => c.pct_change != null && parseFloat(c.pct_change) < 0)
        .sort((a, b) => parseFloat(a.pct_change!) - parseFloat(b.pct_change!))
        .slice(0, TOP_N),
    [cardPerf]
  );

  const noMovement = gainers.length === 0 && losers.length === 0;

  if (noMovement) {
    return (
      <div className="rounded-lg border border-subtle bg-surface p-6 text-center text-sm text-cream-dim/40">
        Price history is too new to compute changes yet.
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {/* Gainers */}
      <div className="rounded-xl border border-red-900/30 bg-surface overflow-hidden">
        <div className="px-3 py-2 border-b border-red-900/20 bg-red-900/10 flex items-center gap-2">
          <span className="text-red-400 font-bold text-sm">↑</span>
          <span className="text-xs font-semibold text-cream">
            Biggest Gainers
          </span>
          <span className="text-[10px] text-cream-dim/40 ml-auto">
            since release
          </span>
        </div>
        {gainers.length > 0 ? (
          <div className="divide-y divide-subtle/30 py-1">
            {gainers.map((card) => (
              <CardRow key={card.card_id} card={card} isGainer />
            ))}
          </div>
        ) : (
          <div className="px-3 py-6 text-center text-xs text-cream-dim/40">
            No cards have gained value yet
          </div>
        )}
      </div>

      {/* Losers */}
      <div className="rounded-xl border border-green-900/30 bg-surface overflow-hidden">
        <div className="px-3 py-2 border-b border-green-900/20 bg-green-900/10 flex items-center gap-2">
          <span className="text-green-400 font-bold text-sm">↓</span>
          <span className="text-xs font-semibold text-cream">
            Biggest Drops
          </span>
          <span className="text-[10px] text-cream-dim/40 ml-auto">
            best buying opportunities
          </span>
        </div>
        {losers.length > 0 ? (
          <div className="divide-y divide-subtle/30 py-1">
            {losers.map((card) => (
              <CardRow key={card.card_id} card={card} isGainer={false} />
            ))}
          </div>
        ) : (
          <div className="px-3 py-6 text-center text-xs text-cream-dim/40">
            No cards have dropped in value yet
          </div>
        )}
      </div>

      {/* Bottom share nudge */}
      <div className="sm:col-span-2 text-[11px] text-cream-dim/40 text-center">
        Prices are cheapest non-foil in-stock AU store price vs first recorded price ·{" "}
        <a href={`/sets/${setCode}`} className="hover:text-accent transition-colors">
          Share this page
        </a>
      </div>
    </div>
  );
}
