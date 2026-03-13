"use client";

import { useState, useMemo } from "react";
import type { CardRow, PrintingWithPrices, CardPriceHistory } from "@/lib/db";
import { PricesTable } from "./PricesTable";
import { PriceChart } from "./PriceChart";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function CardDetailView({
  card,
  printings,
  trend,
  history,
}: {
  card: CardRow;
  printings: PrintingWithPrices[];
  trend: "up" | "down" | "neutral" | null;
  history: CardPriceHistory;
}) {
  const defaultImage =
    printings.find((p) => p.imageUri && !p.isFoil)?.imageUri ??
    printings.find((p) => p.imageUri)?.imageUri ??
    null;

  const [displayImage, setDisplayImage] = useState<string | null>(defaultImage);
  const colors = card.colors.length === 0 ? ["C"] : card.colors;

  const snapshot = useMemo(() => {
    const inStockPrices = printings
      .flatMap((p) => p.prices)
      .filter((p) => p.inStock)
      .map((p) => parseFloat(p.priceAud))
      .filter((n) => !isNaN(n));
    if (inStockPrices.length === 0) return null;
    const usdPrices = printings
      .filter((p) => !p.isFoil && p.usdPrice)
      .map((p) => parseFloat(p.usdPrice!))
      .filter((n) => !isNaN(n));
    return {
      low: Math.min(...inStockPrices),
      high: Math.max(...inStockPrices),
      scrymarket: median(inStockPrices),
      usd: usdPrices.length > 0 ? Math.min(...usdPrices) : null,
    };
  }, [printings]);

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8 lg:items-start">

      {/* Left: sticky card image */}
      <div className="lg:sticky lg:top-4 max-w-[200px] mx-auto lg:max-w-none mb-6 lg:mb-0">
        {displayImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={displayImage}
            src={displayImage}
            alt={card.name}
            className="w-full rounded-xl shadow-2xl shadow-black/60 transition-opacity duration-150"
            style={{ aspectRatio: "63/88", objectFit: "cover" }}
          />
        ) : (
          <div
            className="w-full rounded-xl bg-muted border border-subtle flex items-center justify-center text-cream-dim/50 text-sm"
            style={{ aspectRatio: "63/88" }}
          >
            No image
          </div>
        )}
      </div>

      {/* Right: card info + prices */}
      <div>
        {/* Title + type/color block left, market snapshot right */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-cream mb-1">{card.name}</h1>
            <div className="flex items-center gap-2">
              <span className="text-cream-dim">{card.type_line}</span>
              <div className="flex items-center gap-1">
                {colors.map((c) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={c}
                    src={`https://svgs.scryfall.io/card-symbols/${c}.svg`}
                    alt={c}
                    width={16}
                    height={16}
                    className="inline-block"
                  />
                ))}
              </div>
            </div>
          </div>

          {snapshot && (
            <div className="shrink-0 rounded-lg border border-subtle bg-surface px-4 py-2.5">
              {/* Top row: USD ref price + trend badge */}
              <div className="flex items-center justify-between gap-3 mb-2">
                {snapshot.usd != null ? (
                  <span className="text-xs text-cream-dim/50">{fmt(snapshot.usd)} <span className="text-[10px]">USD</span></span>
                ) : <span />}
                {trend === "up" && (
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-red-900/40 text-red-400 text-[9px] font-bold">↑</span>
                )}
                {trend === "down" && (
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-green-900/40 text-green-400 text-[9px] font-bold">↓</span>
                )}
                {trend === "neutral" && (
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-subtle/40 text-cream-dim/50 text-[9px] font-bold">→</span>
                )}
              </div>
              {/* Price row */}
              <div className="flex gap-4 text-xs">
                <div className="text-center">
                  <div className="text-cream-dim/60 mb-0.5">Low</div>
                  <div className="text-green-400 font-semibold">{fmt(snapshot.low)}</div>
                </div>
                <div className="text-center">
                  <div className="text-cream-dim/60 mb-0.5">Scrymarket</div>
                  <div className="text-price font-semibold">{fmt(snapshot.scrymarket)}</div>
                </div>
                <div className="text-center">
                  <div className="text-cream-dim/60 mb-0.5">High</div>
                  <div className="text-cream-dim font-semibold">{fmt(snapshot.high)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {printings.length === 0 ? (
          <p className="text-cream-dim/50">No printings found for this card.</p>
        ) : (
          <PricesTable
            printings={printings}
            defaultImage={defaultImage}
            onHoverImage={setDisplayImage}
          />
        )}
        <PriceChart history={history} />
      </div>
    </div>
  );
}
