"use client";

import { useState, useMemo } from "react";
import type { SetCardPerf } from "@/lib/db";
import { fmtAUD, cardHref } from "@/lib/utils";

type SortKey = "name" | "current_price" | "pct_change" | "rarity";
type SortDir = "asc" | "desc";

const RARITY_ORDER: Record<string, number> = {
  mythic: 1,
  rare: 2,
  uncommon: 3,
  common: 4,
};

const RARITY_BADGE: Record<string, { label: string; class: string }> = {
  mythic: { label: "M", class: "bg-orange-900/30 text-orange-400 border-orange-900/40" },
  rare: { label: "R", class: "bg-yellow-900/30 text-yellow-400 border-yellow-900/40" },
  uncommon: { label: "U", class: "bg-blue-900/30 text-blue-300 border-blue-900/40" },
  common: { label: "C", class: "bg-subtle text-cream-dim border-subtle" },
};

const PAGE_SIZE = 25;

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`text-left text-[10px] uppercase tracking-wider text-cream-dim/40 hover:text-cream-dim transition-colors flex items-center gap-0.5 ${className}`}
    >
      {label}
      {active ? (
        <span className="text-accent ml-0.5">{dir === "asc" ? "↑" : "↓"}</span>
      ) : null}
    </button>
  );
}

export function SetCardExplorer({
  cardPerf,
  setCode,
}: {
  cardPerf: SetCardPerf[];
  setCode: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("pct_change");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [rarityFilter, setRarityFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
    setPage(0);
  }

  const rarities = useMemo(
    () => ["all", ...Array.from(new Set(cardPerf.map((c) => c.rarity))).sort((a, b) => (RARITY_ORDER[a] ?? 9) - (RARITY_ORDER[b] ?? 9))],
    [cardPerf]
  );

  const filtered = useMemo(
    () =>
      rarityFilter === "all"
        ? cardPerf
        : cardPerf.filter((c) => c.rarity === rarityFilter),
    [cardPerf, rarityFilter]
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "current_price":
          cmp =
            (a.current_price != null ? parseFloat(a.current_price) : -1) -
            (b.current_price != null ? parseFloat(b.current_price) : -1);
          break;
        case "pct_change":
          cmp =
            (a.pct_change != null ? parseFloat(a.pct_change) : -9999) -
            (b.pct_change != null ? parseFloat(b.pct_change) : -9999);
          break;
        case "rarity":
          cmp = (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageSlice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-cream-dim/40 uppercase tracking-wider">
          Rarity
        </span>
        {rarities.map((r) => {
          const badge = RARITY_BADGE[r];
          return (
            <button
              key={r}
              onClick={() => { setRarityFilter(r); setPage(0); }}
              className={`rounded px-2 py-0.5 text-[10px] font-medium border transition-colors ${
                rarityFilter === r
                  ? "bg-accent-muted text-accent-light border-accent-border"
                  : "bg-muted text-cream-dim/50 border-subtle hover:text-cream-dim"
              }`}
            >
              {badge ? badge.label : "All"}
            </button>
          );
        })}
        <span className="ml-auto text-[10px] text-cream-dim/30">
          {filtered.length} card{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-subtle bg-surface overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_auto_auto] sm:grid-cols-[auto_1fr_auto_auto_auto] gap-0 border-b border-subtle bg-cream-muted/30">
          <div className="px-3 py-2" />
          <div className="px-2 py-2">
            <SortHeader label="Card" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
          </div>
          <div className="px-3 py-2">
            <SortHeader label="Price" sortKey="current_price" current={sortKey} dir={sortDir} onSort={handleSort} className="justify-end" />
          </div>
          <div className="hidden sm:block px-3 py-2">
            <SortHeader label="Was" sortKey="current_price" current={sortKey} dir={sortDir} onSort={handleSort} className="justify-end" />
          </div>
          <div className="px-3 py-2">
            <SortHeader label="Chg" sortKey="pct_change" current={sortKey} dir={sortDir} onSort={handleSort} className="justify-end" />
          </div>
        </div>

        {/* Rows */}
        {pageSlice.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-cream-dim/40">
            No cards match the selected filter.
          </div>
        ) : (
          <div className="divide-y divide-subtle/30">
            {pageSlice.map((card) => {
              const pct = card.pct_change != null ? parseFloat(card.pct_change) : null;
              const current =
                card.current_price != null ? parseFloat(card.current_price) : null;
              const first =
                card.first_price != null ? parseFloat(card.first_price) : null;
              const badge = RARITY_BADGE[card.rarity];

              return (
                <a
                  key={card.card_id}
                  href={cardHref(card.slug, card.card_id)}
                  className="grid grid-cols-[auto_1fr_auto_auto] sm:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-0 hover:bg-muted transition-colors group"
                >
                  {/* Thumbnail */}
                  <div className="px-2 py-1.5">
                    {card.image_uri ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={card.image_uri}
                        alt={card.name}
                        width={24}
                        height={33}
                        className="rounded shrink-0 opacity-80 group-hover:opacity-100 transition-opacity"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-6 h-8 rounded bg-subtle" />
                    )}
                  </div>

                  {/* Name + rarity */}
                  <div className="px-2 py-1.5 min-w-0 flex items-center gap-1.5">
                    {badge && (
                      <span
                        className={`text-[8px] font-bold border rounded px-1 py-0.5 shrink-0 ${badge.class}`}
                      >
                        {badge.label}
                      </span>
                    )}
                    <span className="text-xs text-cream truncate group-hover:text-accent transition-colors">
                      {card.name}
                    </span>
                  </div>

                  {/* Current price */}
                  <div className="px-3 py-1.5 text-right">
                    <span className="text-xs font-semibold text-price">
                      {current != null ? fmtAUD(current) : "—"}
                    </span>
                  </div>

                  {/* First price (desktop) */}
                  <div className="hidden sm:block px-3 py-1.5 text-right">
                    <span className="text-[10px] text-cream-dim/40">
                      {first != null ? fmtAUD(first) : "—"}
                    </span>
                  </div>

                  {/* % change */}
                  <div className="px-3 py-1.5 text-right w-16">
                    {pct != null ? (
                      <span
                        className={`text-xs font-medium ${
                          pct > 0 ? "text-red-400" : pct < 0 ? "text-green-400" : "text-cream-dim/40"
                        }`}
                      >
                        {pct > 0 ? "+" : ""}
                        {pct.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-cream-dim/20">—</span>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-cream-dim/50">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 rounded border border-subtle bg-muted hover:text-cream disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="px-3 py-1 rounded border border-subtle bg-muted hover:text-cream disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      <div className="text-[10px] text-cream-dim/30 text-center">
        % change = (current price − first recorded price) ÷ first recorded price ·{" "}
        <span className="text-green-400/60">green = cheaper now</span> ·{" "}
        <span className="text-red-400/60">red = more expensive now</span>
      </div>
    </div>
  );
}
