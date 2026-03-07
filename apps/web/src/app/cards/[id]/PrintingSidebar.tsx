"use client";

import { useState } from "react";
import type { PrintingWithPrices } from "@/lib/db";

type FoilFilter = "all" | "nonfoil" | "foil";

const RARITY_COLORS: Record<string, string> = {
  common: "text-gray-400",
  uncommon: "text-slate-300",
  rare: "text-yellow-400",
  mythic: "text-orange-400",
};

function lowestInStockPrice(printing: PrintingWithPrices): number | null {
  const inStock = printing.prices.filter((p) => p.inStock);
  if (inStock.length === 0) return null;
  return Math.min(...inStock.map((p) => parseFloat(p.priceAud)));
}

interface Props {
  // Printings pre-sorted by the server: in-stock first, then by price
  printings: PrintingWithPrices[];
  selectedId: string | undefined;
}

export function PrintingSidebar({ printings, selectedId }: Props) {
  const [inStockOnly, setInStockOnly] = useState(false);
  const [foilFilter, setFoilFilter] = useState<FoilFilter>("all");

  // Apply filters — always keep the currently selected printing visible
  const filtered = printings.filter((p) => {
    if (p.id === selectedId) return true; // never hide the selected one
    if (inStockOnly && lowestInStockPrice(p) === null) return false;
    if (foilFilter === "nonfoil" && p.isFoil) return false;
    if (foilFilter === "foil" && !p.isFoil) return false;
    return true;
  });

  const totalWithPrices = printings.filter(
    (p) => lowestInStockPrice(p) !== null
  ).length;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Printings
          </span>
          <span className="text-xs text-gray-500">
            {filtered.length} / {printings.length}
          </span>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-1">
          {/* Stock filter */}
          <button
            onClick={() => setInStockOnly(!inStockOnly)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              inStockOnly
                ? "bg-green-800 text-green-300"
                : "bg-gray-800 text-gray-400 hover:text-gray-300"
            }`}
          >
            In Stock ({totalWithPrices})
          </button>

          {/* Foil filter */}
          {(["all", "nonfoil", "foil"] as FoilFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFoilFilter(f)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                foilFilter === f
                  ? "bg-indigo-800 text-indigo-300"
                  : "bg-gray-800 text-gray-400 hover:text-gray-300"
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
          <div className="px-3 py-4 text-xs text-gray-500 text-center">
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
                className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-800/60 last:border-0 transition-colors ${
                  isSelected
                    ? "bg-indigo-900/40 border-l-2 border-l-indigo-500"
                    : "hover:bg-gray-800/60"
                }`}
              >
                {/* Thumbnail */}
                <div className="shrink-0 w-8 h-11 rounded overflow-hidden bg-gray-800">
                  {p.imageUri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUri.replace("/normal/", "/small/")}
                      alt={p.setName}
                      className="w-full h-full object-cover object-top"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-700" />
                  )}
                </div>

                {/* Set info */}
                <div className="flex-1 min-w-0">
                  <div
                    className={`truncate text-xs font-medium ${isSelected ? "text-indigo-300" : "text-gray-200"}`}
                  >
                    {p.setName}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-gray-500">
                      #{p.collectorNumber}
                    </span>
                    {p.isFoil && (
                      <span className="text-[10px] text-indigo-400">✦</span>
                    )}
                    <span
                      className={`text-[10px] capitalize ${RARITY_COLORS[p.rarity] ?? "text-gray-500"}`}
                    >
                      {p.rarity[0]?.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Price */}
                <div className="shrink-0 text-right">
                  {minPrice !== null ? (
                    <span className="text-xs text-green-400 font-medium">
                      ${minPrice.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-600">—</span>
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
