"use client";

import { useEffect, useRef, useState } from "react";
import { CardThumb } from "./CardThumb";
import { ColorSymbols } from "./ColorSymbols";
import { TrendBadge } from "./TrendBadge";
import { fmtAUD, cardHref } from "@/lib/utils";
import { useWantList } from "@/app/WantListContext";
import type { CardSearchResult } from "@/lib/db";

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}


function AddToWantListButton({ card }: { card: CardSearchResult }) {
  const { items, addItem } = useWantList();
  const [adding, setAdding] = useState(false);
  const alreadyAdded = items.some((i) => i.cardId === card.id);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (alreadyAdded || adding || !card.scrymarket_price) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/cards/store-printings?cardId=${card.id}`);
      const printings: {
        id: string; setName: string; setCode: string; rarity: string; isFoil: boolean;
        imageUri: string | null; priceAud: number; shippingAud: number | null;
        condition: string | null; url: string | null; storeId: string; storeName: string;
      }[] = await res.json();
      if (!printings?.length) return;
      const printing = [...printings].sort((a, b) => a.priceAud - b.priceAud)[0];
      addItem({
        id: `${printing.id}-${printing.storeId}-${printing.url ?? ""}`,
        cardId: card.id,
        cardSlug: card.slug,
        cardName: card.name,
        printingId: printing.id,
        setName: printing.setName,
        setCode: printing.setCode,
        rarity: printing.rarity,
        isFoil: printing.isFoil,
        storeId: printing.storeId,
        storeName: printing.storeName,
        priceAud: printing.priceAud,
        shippingAud: printing.shippingAud,
        condition: printing.condition,
        url: printing.url,
        imageUri: printing.imageUri,
      });
    } finally {
      setAdding(false);
    }
  }

  if (!card.scrymarket_price) return null;

  return (
    <div className="group relative">
      <button
        onClick={handleClick}
        disabled={adding}
        aria-label={alreadyAdded ? "In want list" : "Add cheapest printing to want list"}
        className={`w-7 h-7 rounded flex items-center justify-center text-sm transition-colors ${
          alreadyAdded
            ? "bg-price/20 text-price"
            : adding
            ? "bg-muted text-cream-dim/30"
            : "bg-muted text-cream-dim/40 hover:bg-price/20 hover:text-price"
        }`}
      >
        {alreadyAdded ? "✓" : adding ? "…" : "+"}
      </button>
      {!alreadyAdded && (
        <div className="pointer-events-none absolute bottom-full right-0 mb-1.5 hidden group-hover:block z-20">
          <div className="whitespace-nowrap rounded bg-surface border border-subtle px-2 py-1 text-[11px] text-cream-dim shadow-lg">
            Add cheapest printing to want list
          </div>
        </div>
      )}
    </div>
  );
}

function CardRow({ card }: { card: CardSearchResult }) {
  return (
    <div className="relative flex items-center rounded-lg border border-subtle bg-surface hover:border-accent hover:bg-muted transition-colors overflow-hidden">
      <a
        href={cardHref(card.slug, card.id)}
        onClick={() => window.umami?.track("card-click", { card: card.name })}
        className="flex flex-1 items-center gap-3 min-w-0 pr-14"
      >
        {/* Thumbnail */}
        <CardThumb
          imageUri={card.image_uri}
          alt={card.name}
          className="w-[44px] h-[61px] sm:w-[63px] sm:h-[88px]"
          delayMs={0}
        />

        {/* Info */}
        <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="flex gap-1 mb-1">
              <ColorSymbols colors={card.colors} size={12} />
            </div>
            <div className="font-medium text-cream truncate">{card.name}</div>
            <div className="text-sm text-cream-dim truncate">{card.type_line}</div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Trend badge */}
            {card.scrymarket_price && <TrendBadge trend={card.trend} size="lg" />}
            {/* Price */}
            <div className="text-right">
              {card.scrymarket_price ? (
                <div className="text-price font-medium">
                  {fmtAUD(parseFloat(card.scrymarket_price))}
                </div>
              ) : (
                <div className="text-cream-dim/50 text-sm">no prices</div>
              )}
              <div className="text-xs text-cream-dim/70">
                {card.printing_count} printing{card.printing_count !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>
      </a>

      {/* Want list button — outside the <a> to avoid nested interactive elements */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        <AddToWantListButton card={card} />
      </div>
    </div>
  );
}

interface Props {
  initialResults: CardSearchResult[];
  query: string;
  initialHasMore: boolean;
  totalCount: number;
}

export function SearchResults({ initialResults, query, initialHasMore, totalCount }: Props) {
  const [cards, setCards] = useState(initialResults);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(initialResults.length);
  const loadingRef = useRef(false);

  useEffect(() => {
    // Reset when query changes
    setCards(initialResults);
    setHasMore(initialHasMore);
    offsetRef.current = initialResults.length;
    if (query) window.umami?.track("card-search", { query });
  }, [initialResults, initialHasMore, query]);

  useEffect(() => {
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries[0].isIntersecting || loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&offset=${offsetRef.current}`);
        const data = await res.json();
        setCards((prev) => [...prev, ...data.results]);
        offsetRef.current += data.results.length;
        setHasMore(data.hasMore);
        loadingRef.current = false;
        setLoading(false);
      },
      { rootMargin: "200px" }
    );

    const el = sentinelRef.current;
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [query, hasMore]);

  return (
    <div className="space-y-2">
      <p className="text-sm text-cream-dim/70 mb-3">
        {totalCount} result{totalCount !== 1 ? "s" : ""}
      </p>

      {cards.map((card) => (
        <CardRow key={card.id} card={card} />
      ))}

      {/* Sentinel + loading indicator */}
      <div ref={sentinelRef} />
      {loading && (
        <div className="py-4 text-center text-cream-dim/50 text-sm">Loading more…</div>
      )}
      {!hasMore && cards.length > 0 && (
        <div className="py-2 text-center text-cream-dim/30 text-xs">— end of results —</div>
      )}
    </div>
  );
}
