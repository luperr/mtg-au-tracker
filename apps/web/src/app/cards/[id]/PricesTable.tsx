"use client";

import React, { useState, useMemo, useRef, useEffect, type ReactNode, type SyntheticEvent } from "react";
import type { PrintingWithPrices } from "@/lib/db";

type FoilFilter = "all" | "nonfoil" | "foil";
type SortBy = "price_asc" | "price_desc" | "newest" | "oldest";


// CSS filters to tint black SVGs to match MTG rarity colours (metallic, slightly muted)
const RARITY_FILTER: Record<string, string> = {
  common:   "invert(55%) brightness(0.85) contrast(0.9)",                                                                // muted silver
  uncommon: "invert(60%) sepia(25%) saturate(200%) hue-rotate(175deg) brightness(0.85) contrast(0.9)",                  // cool steel
  rare:     "invert(65%) sepia(70%) saturate(220%) hue-rotate(8deg) brightness(0.78) contrast(0.88)",                   // dull antique gold
  mythic:   "invert(50%) sepia(80%) saturate(350%) hue-rotate(338deg) brightness(0.82) contrast(0.9)",                  // burnt orange
  special:  "invert(55%) sepia(70%) saturate(400%) hue-rotate(268deg) brightness(0.82) contrast(0.9)",                  // muted purple
  bonus:    "invert(55%) sepia(70%) saturate(400%) hue-rotate(268deg) brightness(0.82) contrast(0.9)",
};

const SORT_LABELS: Record<SortBy, string> = {
  price_asc: "Price: Low → High",
  price_desc: "Price: High → Low",
  newest: "Newest First",
  oldest: "Oldest First",
};

interface Row {
  printing: PrintingWithPrices;
  storeName: string;
  priceAud: number;
  condition: string | null;
  inStock: boolean;
  url: string | null;
}

// ── Shared dropdown shell ─────────────────────────────────────────────────────

function Dropdown({
  label,
  active,
  children,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
          active
            ? "border-accent-border bg-accent-muted text-accent-light"
            : "border-subtle bg-muted text-cream-dim hover:text-cream hover:border-accent-border"
        }`}
      >
        {label}
        <span className="text-[9px] opacity-50">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 min-w-[190px] rounded-lg border border-subtle bg-surface shadow-xl shadow-black/50">
          {children}
        </div>
      )}
    </div>
  );
}

function OptionItem({
  label,
  checked,
  onClick,
  type = "radio",
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  type?: "radio" | "check";
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
        checked ? "text-cream" : "text-cream-dim"
      }`}
    >
      <span
        className={`w-3 h-3 ${type === "radio" ? "rounded-full" : "rounded"} border shrink-0 ${
          checked ? "border-accent bg-accent" : "border-subtle"
        }`}
      />
      {label}
    </button>
  );
}

// ── Set symbol with fallback ──────────────────────────────────────────────────

const RARITY_FALLBACK_COLOR: Record<string, string> = {
  common:   "#888",
  uncommon: "#8aa7b8",
  rare:     "#a8894a",
  mythic:   "#b5642a",
  special:  "#8a5fb5",
  bonus:    "#8a5fb5",
};

function SetSymbol({ setCode, setName, rarity }: { setCode: string; setName: string; rarity: string }) {
  const [failed, setFailed] = useState(false);
  const color = RARITY_FALLBACK_COLOR[rarity] ?? RARITY_FALLBACK_COLOR.common;

  if (failed) {
    return (
      <span
        style={{ color, fontSize: 14, width: 18, textAlign: "center", display: "inline-block" }}
        title={setName}
      >
        ❖
      </span>
    );
  }

  function onError(e: SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.style.display = "none";
    setFailed(true);
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://svgs.scryfall.io/sets/${setCode}.svg`}
      alt={setName}
      width={18}
      height={18}
      className="shrink-0"
      style={{ filter: RARITY_FILTER[rarity] ?? RARITY_FILTER.common }}
      loading="lazy"
      onError={onError}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PricesTable({
  printings,
  defaultImage,
  onHoverImage,
}: {
  printings: PrintingWithPrices[];
  defaultImage: string | null;
  onHoverImage: (uri: string | null) => void;
}) {
  const [inStockOnly, setInStockOnly] = useState(false);
  const [foilFilter, setFoilFilter] = useState<FoilFilter>("all");
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
  const [selectedSets, setSelectedSets] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>("price_asc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const allStores = useMemo(() => {
    const s = new Set<string>();
    for (const p of printings) for (const pr of p.prices) s.add(pr.storeName);
    return Array.from(s).sort();
  }, [printings]);

  const allSets = useMemo(() => {
    const s = new Map<string, string>(); // setName → releasedAt
    for (const p of printings) s.set(p.setName, p.releasedAt ? String(p.releasedAt) : "");
    return Array.from(s.entries())
      .sort((a, b) => b[1].localeCompare(a[1])) // newest first in dropdown
      .map(([name]) => name);
  }, [printings]);

  function toggleInSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setPage(0);
    setter((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }

  const rows = useMemo<Row[]>(() => {
    const flat: Row[] = [];
    for (const printing of printings) {
      if (foilFilter === "nonfoil" && printing.isFoil) continue;
      if (foilFilter === "foil" && !printing.isFoil) continue;
      if (selectedSets.size > 0 && !selectedSets.has(printing.setName)) continue;
      for (const price of printing.prices) {
        if (inStockOnly && !price.inStock) continue;
        if (selectedStores.size > 0 && !selectedStores.has(price.storeName)) continue;
        flat.push({
          printing,
          storeName: price.storeName,
          priceAud: parseFloat(price.priceAud),
          condition: price.condition,
          inStock: price.inStock,
          url: price.url,
        });
      }
    }
    return flat.sort((a, b) => {
      switch (sortBy) {
        case "price_asc":
          return a.priceAud - b.priceAud;
        case "price_desc":
          return b.priceAud - a.priceAud;
        case "newest":
          return String(b.printing.releasedAt ?? "").localeCompare(String(a.printing.releasedAt ?? ""));
        case "oldest":
          return String(a.printing.releasedAt ?? "").localeCompare(String(b.printing.releasedAt ?? ""));
      }
    });
  }, [printings, inStockOnly, foilFilter, selectedStores, selectedSets, sortBy]);

  const filtersActive =
    inStockOnly || foilFilter !== "all" || selectedStores.size > 0 || selectedSets.size > 0;

  const stockLabel = inStockOnly ? "In Stock" : "Stock";
  const foilLabel =
    foilFilter === "foil" ? "✦ Foil Only" : foilFilter === "nonfoil" ? "Non-foil" : "Foil";
  const storeLabel = selectedStores.size > 0 ? `Stores (${selectedStores.size})` : "Store";
  const setLabel = selectedSets.size > 0 ? `Sets (${selectedSets.size})` : "Set";

  const clearFilters = () => {
    setInStockOnly(false);
    setFoilFilter("all");
    setSelectedStores(new Set());
    setSelectedSets(new Set());
    setPage(0);
  };

  // Reset to page 0 whenever filters/sort change
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      {/* Table with filter dropdowns embedded in column headers */}
      <div className="rounded-lg border border-subtle bg-surface overflow-visible">
        {rows.length === 0 && !filtersActive ? (
          <div className="px-4 py-8 text-center text-cream-dim/50">
            No prices available
          </div>
        ) : (
          <div className="overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs bg-cream-muted border-b border-subtle">
                {/* Set column — set filter + foil filter */}
                <th className="px-4 py-2 text-left font-medium">
                  <Dropdown label={selectedSets.size > 0 || foilFilter !== "all" ? `Set ·` : "Set"} active={selectedSets.size > 0 || foilFilter !== "all"}>
                    <div className="py-1">
                      <div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-cream-dim/40">Foil</div>
                      <OptionItem label="All" checked={foilFilter === "all"} onClick={() => { setFoilFilter("all"); setPage(0); }} />
                      <OptionItem label="Non-foil only" checked={foilFilter === "nonfoil"} onClick={() => { setFoilFilter("nonfoil"); setPage(0); }} />
                      <OptionItem label="✦ Foil only" checked={foilFilter === "foil"} onClick={() => { setFoilFilter("foil"); setPage(0); }} />
                      {allSets.length > 1 && (
                        <>
                          <div className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-cream-dim/40">Sets</div>
                          <div className="max-h-48 overflow-y-auto">
                            {allSets.map((set) => (
                              <OptionItem type="check" key={set} label={set} checked={selectedSets.has(set)} onClick={() => toggleInSet(setSelectedSets, set)} />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </Dropdown>
                </th>

                {/* Store column — store filter */}
                <th className="px-3 py-2 text-left font-medium">
                  <Dropdown label={storeLabel} active={selectedStores.size > 0}>
                    <div className="py-1">
                      {allStores.map((store) => (
                        <OptionItem type="check" key={store} label={store} checked={selectedStores.has(store)} onClick={() => toggleInSet(setSelectedStores, store)} />
                      ))}
                    </div>
                  </Dropdown>
                </th>

                {/* Price AUD column — sort */}
                <th className="px-3 py-2 text-right font-medium">
                  <div className="flex justify-end">
                    <Dropdown label={`Price AUD ↕`} active={sortBy !== "price_asc"}>
                      <div className="py-1">
                        {(Object.entries(SORT_LABELS) as [SortBy, string][]).map(([key, label]) => (
                          <OptionItem key={key} label={label} checked={sortBy === key} onClick={() => { setSortBy(key); setPage(0); }} />
                        ))}
                      </div>
                    </Dropdown>
                  </div>
                </th>

                {/* Stock column — stock filter */}
                <th className="px-3 py-2 text-center font-medium">
                  <div className="flex justify-center">
                    <Dropdown label={stockLabel} active={inStockOnly}>
                      <div className="py-1">
                        <OptionItem label="All" checked={!inStockOnly} onClick={() => { setInStockOnly(false); setPage(0); }} />
                        <OptionItem label="In stock only" checked={inStockOnly} onClick={() => { setInStockOnly(true); setPage(0); }} />
                      </div>
                    </Dropdown>
                  </div>
                </th>

                {/* Last column — clear + count */}
                <th className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {filtersActive && (
                      <button onClick={clearFilters} className="text-[10px] text-cream-dim/40 hover:text-cream-dim transition-colors">
                        Clear
                      </button>
                    )}
                    <span className="text-[10px] text-cream-dim/30">
                      {rows.length}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={`${row.printing.id}-${row.storeName}-${row.priceAud}`}
                  className="border-b border-subtle/60 last:border-0 hover:bg-muted transition-colors cursor-default"
                  onMouseEnter={() => onHoverImage(row.printing.imageUri)}
                  onMouseLeave={() => onHoverImage(defaultImage)}
                >
                  {/* Set symbol + name */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <SetSymbol
                        setCode={row.printing.setCode}
                        setName={row.printing.setName}
                        rarity={row.printing.rarity}
                      />
                      <span className="text-cream truncate max-w-[160px]">
                        {row.printing.setName}
                      </span>
                      {row.printing.isFoil && (
                        <span className="text-[10px] text-accent shrink-0">✦</span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-2.5 text-cream font-medium">{row.storeName}</td>

                  <td className="px-3 py-2.5 text-right text-price font-semibold">
                    ${row.priceAud.toFixed(2)}
                  </td>

                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.inStock
                          ? "bg-green-900/50 text-green-400"
                          : "bg-red-900/50 text-red-400"
                      }`}
                    >
                      {row.inStock ? "In stock" : "Out"}
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-right">
                    {row.url && (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-price hover:text-cream text-sm transition-colors"
                      >
                        Buy ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-cream-dim/50">
                    No prices match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-subtle bg-cream-muted text-xs text-cream-dim/60">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="disabled:opacity-30 hover:text-cream transition-colors"
              >
                ← Prev
              </button>
              <span>
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="disabled:opacity-30 hover:text-cream transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
