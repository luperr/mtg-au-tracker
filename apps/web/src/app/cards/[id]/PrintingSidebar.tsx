"use client";

import { useState } from "react";
import type { PrintingWithPrices } from "@/lib/db";

type FoilFilter = "all" | "nonfoil" | "foil";

const RARITY_COLORS: Record<string, string> = {
  common: "text-cream-dim/50",
  uncommon: "text-cream-dim",
  rare: "text-yellow-400",
  mythic: "text-price",
};

function lowestInStockPrice(printing: PrintingWithPrices): number | null {
  const inStock = printing.prices.filter((p) => p.inStock);
  if (inStock.length === 0) return null;
  return Math.min(...inStock.map((p) => parseFloat(p.priceAud)));
}

interface Props {
  printings: PrintingWithPrices[];
  selectedId: string | undefined;
}

export function PrintingSidebar({ printings, selectedId }: Props) {
  const [inStockOnly, setInStockOnly] = useState(false);
  const [foilFilter, setFoilFilter] = useState<FoilFilter>("all");

  const filtered = printings.filter((p) => {
    if (p.id === selectedId) return true;
    if (inStockOnly && lowestInStockPrice(p) === null) return false;
    if (foilFilter === "nonfoil" && p.isFoil) return false;
    if (foilFilter === "foil" && !p.isFoil) return false;
    return true;
  });

  const totalWithPrices = printings.filter(
    (p) => lowestInStockPrice(p) !== null
  ).length;

  return (
    <div className="rounded-lg border border-subtle bg-surface overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-subtle">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-cream-dim/60 uppercase tracking-wider">
            Printings
          </span>
          <span className="text-xs text-cream-dim/40">
            {filtered.length} / {printings.length}
          </span>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setInStockOnly(!inStockOnly)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              inStockOnly
                ? "bg-price-muted text-price"
                : "bg-muted text-cream-dim/60 hover:text-cream-dim"
            }`}
          >
            In Stock ({totalWithPrices})
          </button>

          {(["all", "nonfoil", "foil"] as FoilFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFoilFilter(f)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                foilFilter === f
                  ? "bg-accent-muted text-accent-light"
                  : "bg-muted text-cream-dim/60 hover:text-cream-dim"
              }`}
            >
              {f === "all" ? "All" : f === "foil" ? "✦ Foil" : "Non-foil"}
            </button>
          ))}
        </div>
      </div>

      {/* Printing list */}
      <div className="max-h-[460px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-cream-dim/40 text-center">
            No printings match filters
          </div>
        ) : (
          filtered.map((p) => {
            const minPrice = lowestInStockPrice(p);
            const isSelected = p.id === selectedId;
            return (
              <a
                key={p.id}
                href={`?printing=${p.id}`}
                className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-subtle/40 last:border-0 transition-colors ${
                  isSelected
                    ? "bg-accent-muted border-l-2 border-l-accent"
                    : "hover:bg-muted"
                }`}
              >
                {/* Thumbnail */}
                <div className="shrink-0 w-8 h-11 rounded overflow-hidden bg-muted">
                  {p.imageUri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUri.replace("/normal/", "/small/")}
                      alt={p.setName}
                      className="w-full h-full object-cover object-top"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-subtle/50" />
                  )}
                </div>

                {/* Set info */}
                <div className="flex-1 min-w-0">
                  <div
                    className={`truncate text-xs font-medium ${isSelected ? "text-accent-light" : "text-cream"}`}
                  >
                    {p.setName}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-cream-dim/50">
                      #{p.collectorNumber}
                    </span>
                    {p.isFoil && (
                      <span className="text-[10px] text-accent">✦</span>
                    )}
                    <span
                      className={`text-[10px] capitalize ${RARITY_COLORS[p.rarity] ?? "text-cream-dim/50"}`}
                    >
                      {p.rarity[0]?.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Price */}
                <div className="shrink-0 text-right">
                  {minPrice !== null ? (
                    <span className="text-xs text-price font-medium">
                      ${minPrice.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-cream-dim/30">—</span>
                  )}
                </div>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
