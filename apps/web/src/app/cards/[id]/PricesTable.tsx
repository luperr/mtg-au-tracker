"use client";

import React, { useState, useMemo, type SyntheticEvent } from "react";
import type { PrintingWithPrices } from "@/lib/db";
import { useWantList } from "@/app/WantListContext";
import { fmtAUD } from "@/lib/format";
import { RARITY_FILTER, RARITY_FALLBACK_COLOR } from "@/lib/rarity";
import { Dropdown, OptionItem } from "@/app/Dropdown";

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

// ── Set symbol with fallback ──────────────────────────────────────────────────

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
  cardId,
  cardName,
}: {
  printings: PrintingWithPrices[];
  defaultImage: string | null;
  onHoverImage: (uri: string | null) => void;
  cardId: string;
  cardName: string;
}) {
  const { addItem, removeItem, hasItem } = useWantList();
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

  const stockLabel = inStockOnly ? "In Stock" : "All";
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
      {/* Toolbar above table */}
      <div className="flex items-center justify-between mb-2 gap-2">
        {/* Left: filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Set dropdown — set checkboxes only */}
          {allSets.length > 1 && (
            <Dropdown label={setLabel} active={selectedSets.size > 0}>
              <div className="py-1 max-h-48 overflow-y-auto">
                {allSets.map((set) => (
                  <OptionItem type="check" key={set} label={set} checked={selectedSets.has(set)} onClick={() => toggleInSet(setSelectedSets, set)} />
                ))}
              </div>
            </Dropdown>
          )}

          {/* Foil toggle button */}
          <button
            onClick={() => { setFoilFilter((f) => f === "foil" ? "all" : "foil"); setPage(0); }}
            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              foilFilter === "foil"
                ? "border-accent-border bg-accent-muted text-accent-light"
                : "border-subtle bg-muted text-cream-dim hover:text-cream hover:border-accent-border"
            }`}
          >
            ✦ Foil
          </button>

          {/* Store dropdown */}
          <Dropdown label={storeLabel} active={selectedStores.size > 0}>
            <div className="py-1">
              {allStores.map((store) => (
                <OptionItem type="check" key={store} label={store} checked={selectedStores.has(store)} onClick={() => toggleInSet(setSelectedStores, store)} />
              ))}
            </div>
          </Dropdown>

          {/* Stock dropdown */}
          <Dropdown label={stockLabel} active={inStockOnly}>
            <div className="py-1">
              <OptionItem label="All" checked={!inStockOnly} onClick={() => { setInStockOnly(false); setPage(0); }} />
              <OptionItem label="In stock only" checked={inStockOnly} onClick={() => { setInStockOnly(true); setPage(0); }} />
            </div>
          </Dropdown>

          {filtersActive && (
            <button onClick={clearFilters} className="text-[10px] text-cream-dim/40 hover:text-cream-dim transition-colors">
              Clear
            </button>
          )}
        </div>

        {/* Right: sort + count */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-cream-dim/30">{rows.length}</span>
          <Dropdown label="Sort" active={sortBy !== "price_asc"}>
            <div className="py-1">
              {(Object.entries(SORT_LABELS) as [SortBy, string][]).map(([key, label]) => (
                <OptionItem key={key} label={label} checked={sortBy === key} onClick={() => { setSortBy(key); setPage(0); }} />
              ))}
            </div>
          </Dropdown>
        </div>
      </div>

      {/* Table */}
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
                      >
                        Buy ↗
                      </a>
                    )}
                  </td>

                  <td className="px-2 py-2.5 text-right">
                    {row.inStock && (() => {
                      // Include URL so each distinct listing (e.g. different eBay sellers) gets a unique ID
                      const itemId = `${row.printing.id}-${row.storeId}-${row.url ?? ""}`;
                      const inList = hasItem(itemId);
                      return (
                        <button
                          onClick={() => {
                            if (inList) {
                              removeItem(itemId);
                            } else {
                              addItem({
                                id: itemId, // `${printingId}-${storeId}-${url}`
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
                    })()}
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
