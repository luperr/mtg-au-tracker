"use client";

import React, { useState, useMemo, useRef } from "react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import type { PrintingWithPrices } from "@/lib/db";
import { useWantList } from "@/app/WantListContext";
import { fmtAUD } from "@/lib/format";
import { Dropdown, OptionItem } from "@/app/Dropdown";
import { SetSymbol } from "@/app/SetSymbol";

type FoilFilter = "all" | "nonfoil" | "foil";
type SortBy = "price_asc" | "price_desc" | "total_asc" | "total_desc" | "newest" | "oldest";

const SORT_LABELS: Record<SortBy, string> = {
  price_asc: "Price: Low → High",
  price_desc: "Price: High → Low",
  total_asc: "Price + Postage: Low → High",
  total_desc: "Price + Postage: High → Low",
  newest: "Newest Set First",
  oldest: "Oldest Set First",
};

interface Row {
  printing: PrintingWithPrices;
  storeId: string;
  storeName: string;
  priceAud: number;
  shippingAud: number | null;
  condition: string | null;
  inStock: boolean;
  url: string | null;
}

const filterBtnCls = (active: boolean) =>
  `flex-1 rounded border px-2 py-1 text-xs font-medium transition-colors ${
    active
      ? "border-accent-border bg-accent-muted text-accent-light"
      : "border-subtle bg-muted text-cream-dim hover:text-cream"
  }`;

// ── Want list button ───────────────────────────────────────────────────────────

function WantListButton({ row, cardId, cardName }: { row: Row; cardId: string; cardName: string }) {
  const { addItem, removeItem, hasItem } = useWantList();
  const itemId = `${row.printing.id}-${row.storeId}-${row.url ?? ""}`;
  const inList = hasItem(itemId);
  return (
    <button
      onClick={() => {
        if (inList) {
          removeItem(itemId);
        } else {
          addItem({
            id: itemId,
            cardId,
            cardName,
            printingId: row.printing.id,
            setName: row.printing.setName,
            setCode: row.printing.setCode,
            rarity: row.printing.rarity,
            isFoil: row.printing.isFoil,
            storeId: row.storeId,
            storeName: row.storeName,
            priceAud: row.priceAud,
            shippingAud: row.shippingAud,
            condition: row.condition,
            url: row.url,
            imageUri: row.printing.imageUri,
          });
        }
      }}
      title={inList ? "Remove from want list" : "Add to want list"}
      className={`w-6 h-6 rounded flex items-center justify-center text-sm transition-colors ${
        inList
          ? "bg-price/20 text-price hover:bg-price/10"
          : "bg-muted text-cream-dim/40 hover:bg-price/20 hover:text-price"
      }`}
    >
      {inList ? "✓" : "+"}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PricesTable({
  printings,
  defaultImage,
  onHoverImage,
  cardId,
  cardName,
}: {
  printings: PrintingWithPrices[];
  defaultImage: string | null;
  onHoverImage: (uri: string | null) => void;
  cardId: string;
  cardName: string;
}) {
  const [inStockOnly, setInStockOnly] = useState(false);
  const [foilFilter, setFoilFilter] = useState<FoilFilter>("all");
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
  const [selectedSets, setSelectedSets] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>("price_asc");
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 10;

  useClickOutside(filtersRef, filtersOpen, () => setFiltersOpen(false));

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
          storeId: price.storeId,
          storeName: price.storeName,
          priceAud: parseFloat(price.priceAud),
          shippingAud: price.shippingAud ? parseFloat(price.shippingAud) : null,
          condition: price.condition,
          inStock: price.inStock,
          url: price.url,
        });
      }
    }
    return flat.sort((a, b) => {
      const totalA = a.priceAud + (a.shippingAud ?? 0);
      const totalB = b.priceAud + (b.shippingAud ?? 0);
      switch (sortBy) {
        case "price_asc":    return a.priceAud - b.priceAud;
        case "price_desc":   return b.priceAud - a.priceAud;
        case "total_asc":    return totalA - totalB;
        case "total_desc":   return totalB - totalA;
        case "newest":       return String(b.printing.releasedAt ?? "").localeCompare(String(a.printing.releasedAt ?? ""));
        case "oldest":       return String(a.printing.releasedAt ?? "").localeCompare(String(b.printing.releasedAt ?? ""));
      }
    });
  }, [printings, inStockOnly, foilFilter, selectedStores, selectedSets, sortBy]);

  const filtersActive =
    inStockOnly || foilFilter !== "all" || selectedStores.size > 0 || selectedSets.size > 0;

  const activeFilterCount =
    (inStockOnly ? 1 : 0) + (foilFilter !== "all" ? 1 : 0) + selectedStores.size + selectedSets.size;

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
      {/* Toolbar above table */}
      <div className="flex items-center justify-between mb-2 gap-2">
        {/* Left: unified Filters button */}
        <div className="flex items-center gap-2" ref={filtersRef}>
          <div className="relative">
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 min-h-[36px] text-xs font-medium transition-colors whitespace-nowrap ${
                filtersActive
                  ? "border-accent-border bg-accent-muted text-accent-light"
                  : "border-subtle bg-muted text-cream-dim hover:text-cream hover:border-accent-border"
              }`}
            >
              Filters
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent text-bg text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
              <span className="text-[9px] opacity-50">{filtersOpen ? "▲" : "▼"}</span>
            </button>

            {filtersOpen && (
              <div className="absolute top-full left-0 mt-1 z-30 w-64 rounded-lg border border-subtle bg-surface shadow-xl shadow-black/50">
                {/* Foil */}
                <div className="p-3 border-b border-subtle/60">
                  <p className="text-[10px] text-cream-dim/50 uppercase tracking-wide mb-2">Foil</p>
                  <div className="flex gap-1.5">
                    {(["all", "nonfoil", "foil"] as FoilFilter[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => { setFoilFilter(f); setPage(0); }}
                        className={filterBtnCls(foilFilter === f)}
                      >
                        {f === "all" ? "All" : f === "nonfoil" ? "Non-foil" : "✦ Foil"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stock */}
                <div className="p-3 border-b border-subtle/60">
                  <p className="text-[10px] text-cream-dim/50 uppercase tracking-wide mb-2">Stock</p>
                  <div className="flex gap-1.5">
                    {([false, true] as const).map((val) => (
                      <button
                        key={String(val)}
                        onClick={() => { setInStockOnly(val); setPage(0); }}
                        className={filterBtnCls(inStockOnly === val)}
                      >
                        {val ? "In stock" : "All"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Store */}
                {allStores.length > 1 && (
                  <div className="p-3 border-b border-subtle/60">
                    <p className="text-[10px] text-cream-dim/50 uppercase tracking-wide mb-1">Store</p>
                    {allStores.map((store) => (
                      <OptionItem key={store} type="check" label={store} checked={selectedStores.has(store)} onClick={() => toggleInSet(setSelectedStores, store)} />
                    ))}
                  </div>
                )}

                {/* Set */}
                {allSets.length > 1 && (
                  <div className="p-3">
                    <p className="text-[10px] text-cream-dim/50 uppercase tracking-wide mb-1">Set</p>
                    <div className="max-h-48 overflow-y-auto">
                      {allSets.map((set) => (
                        <OptionItem key={set} type="check" label={set} checked={selectedSets.has(set)} onClick={() => toggleInSet(setSelectedSets, set)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {filtersActive && (
            <button onClick={clearFilters} className="min-h-[36px] px-2 text-[10px] text-cream-dim/40 hover:text-cream-dim transition-colors">
              Clear
            </button>
          )}
        </div>

        {/* Right: sort + count */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-cream-dim/30">{rows.length}</span>
          <Dropdown label="Sort" active={sortBy !== "price_asc"} align="right">
            <div className="py-1">
              {(Object.entries(SORT_LABELS) as [SortBy, string][]).map(([key, label]) => (
                <OptionItem key={key} label={label} checked={sortBy === key} onClick={() => { setSortBy(key); setPage(0); }} />
              ))}
            </div>
          </Dropdown>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-subtle bg-surface overflow-hidden">
        {rows.length === 0 && !filtersActive ? (
          <div className="px-4 py-8 text-center text-cream-dim/50">
            No prices available
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[360px]">
            <colgroup>
              <col className="w-[180px] sm:w-[220px]" />  {/* Set */}
              <col className="w-[110px] sm:w-[140px]" />  {/* Store */}
              <col className="w-auto" />                   {/* Price */}
              <col className="w-[68px]" />                 {/* Stock */}
              <col className="w-[52px]" />                 {/* Buy link */}
              <col className="w-[40px]" />                 {/* Want button */}
            </colgroup>
            <thead>
              <tr className="text-xs bg-cream-muted border-b border-subtle">
                <th className="px-4 py-2 text-left font-medium text-cream-dim">Set</th>
                <th className="px-3 py-2 text-left font-medium text-cream-dim">Store</th>
                <th className="px-3 py-2 text-right font-medium text-cream-dim">Price AUD <span className="font-normal text-cream-dim/50">(postage)</span></th>
                <th className="px-3 py-2 text-center font-medium text-cream-dim">Stock</th>
                <th className="px-3 py-2" />
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr
                  key={`${row.printing.id}-${row.storeName}-${i}`}
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
                      <span className="text-cream truncate max-w-[160px] hidden sm:inline">
                        {row.printing.setName}
                      </span>
                      {row.printing.isFoil && (
                        <span className="text-[10px] text-accent shrink-0">✦</span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-2.5 text-cream font-medium">{row.storeName}</td>

                  <td className="px-3 py-2.5 text-right text-price font-semibold">
                    {fmtAUD(row.priceAud)}
                    {row.shippingAud !== null && (
                      <span className="ml-1 text-xs font-normal text-cream-dim/60">
                        (+{row.shippingAud === 0 ? "free" : fmtAUD(row.shippingAud)})
                      </span>
                    )}
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
                        onClick={() =>
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (window as any).umami?.track("store-click", {
                            store: row.storeName,
                            card: cardName,
                            price: row.priceAud,
                            source: "card-detail",
                          })
                        }
                      >
                        Buy ↗
                      </a>
                    )}
                  </td>

                  <td className="px-2 py-2.5 text-right">
                    {row.inStock && (
                      <WantListButton row={row} cardId={cardId} cardName={cardName} />
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-cream-dim/50">
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
