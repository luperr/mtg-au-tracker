"use client";

import { useState, useMemo } from "react";
import type { CardRow, PrintingWithPrices, CardPriceHistory } from "@/lib/db";
import { PricesTable } from "./PricesTable";
import { PriceChart } from "./PriceChart";
import { ColorSymbols } from "@/app/ColorSymbols";
import { TrendBadge } from "@/app/TrendBadge";
import { fmtAUD } from "@/lib/utils";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function CardDetailView({
  card,
  cardSlug,
  printings,
  trend,
  history,
  audPerUsd,
}: {
  card: CardRow;
  cardSlug: string;
  printings: PrintingWithPrices[];
  trend: "up" | "down" | "neutral" | null;
  history: CardPriceHistory;
  audPerUsd: number;
}) {
  const defaultImage =
    printings.find((p) => p.imageUri && !p.isFoil)?.imageUri ??
    printings.find((p) => p.imageUri)?.imageUri ??
    null;

  const defaultImageBack =
    printings.find((p) => p.imageUriBack && !p.isFoil)?.imageUriBack ??
    printings.find((p) => p.imageUriBack)?.imageUriBack ??
    null;

  const [displayImage, setDisplayImage] = useState<string | null>(defaultImage);
  const [displayImageBack, setDisplayImageBack] = useState<string | null>(defaultImageBack);
  const [flipped, setFlipped] = useState(false);

  function handleHoverImage(uri: string | null, uriBack?: string | null) {
    setDisplayImage(uri);
    setDisplayImageBack(uriBack ?? null);
    setFlipped(false);
  }

  const shownImage = flipped ? displayImageBack : displayImage;

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


  return (
    <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8 lg:items-start">

      {/* Left: sticky card image */}
      <div className="lg:sticky lg:top-4 max-w-[200px] mx-auto lg:max-w-none mb-6 lg:mb-0">
        <div className="relative">
          {shownImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={shownImage}
              src={shownImage}
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
          {displayImageBack && (
            <button
              onClick={() => setFlipped((f) => !f)}
              title="Flip card"
              className="absolute right-3 bg-black/60 hover:bg-black/80 rounded-full p-1.5 text-white transition-colors"
              style={{ top: "15%" }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6"/>
                <path d="M23 20v-6h-6"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Right: card info + prices */}
      <div>
        {/* Title + type/color block left, market snapshot right */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-cream mb-1">{card.name}</h1>
            <div className="flex items-center gap-2">
              <span className="text-cream-dim">{card.type_line}</span>
              <div className="flex items-center gap-1">
                <ColorSymbols colors={card.colors} size={16} />
              </div>
            </div>
          </div>

          {snapshot && (
            <div className="sm:shrink-0 rounded-lg border border-subtle bg-surface px-4 py-2.5">
              {/* Top row: USD ref price + trend badge */}
              <div className="flex items-center justify-between gap-3 mb-2">
                {snapshot.usd != null ? (
                  <span className="text-xs text-cream-dim/50" title={`US$${snapshot.usd.toFixed(2)} × ${audPerUsd.toFixed(4)}`}>
                    {fmtAUD(snapshot.usd * audPerUsd)} <span className="text-[10px]">USD ref</span>
                  </span>
                ) : <span />}
                <TrendBadge trend={trend} />
              </div>
              {/* Price row */}
              <div className="flex gap-4 text-xs">
                <div className="text-center">
                  <div className="text-cream-dim/60 mb-0.5">Low</div>
                  <div className="text-green-400 font-semibold">{fmtAUD(snapshot.low)}</div>
                </div>
                <div className="text-center">
                  <div className="text-cream-dim/60 mb-0.5">Scrymarket</div>
                  <div className="text-price font-semibold">{fmtAUD(snapshot.scrymarket)}</div>
                </div>
                <div className="text-center">
                  <div className="text-cream-dim/60 mb-0.5">High</div>
                  <div className="text-cream-dim font-semibold">{fmtAUD(snapshot.high)}</div>
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
            onHoverImage={handleHoverImage}
            cardId={card.id}
            cardSlug={cardSlug}
            cardName={card.name}
          />
        )}
        <PriceChart history={history} />
      </div>
    </div>
  );
}
