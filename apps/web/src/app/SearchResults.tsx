"use client";

import { useEffect, useRef, useState } from "react";
import { CardMagnifier } from "./CardMagnifier";
import { ColorSymbols } from "./ColorSymbols";
import type { CardSearchResult } from "@/lib/db";

function toSmallImage(uri: string | null): string | null {
  return uri ? uri.replace("/normal/", "/small/") : null;
}

function CardRow({ card }: { card: CardSearchResult }) {
  const thumb = toSmallImage(card.image_uri);
  return (
    <a
      href={`/cards/${card.id}`}
      className="flex items-center gap-3 rounded-lg border border-subtle bg-surface hover:border-accent hover:bg-muted transition-colors overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="shrink-0 w-[63px] h-[88px] bg-muted overflow-hidden">
        {thumb && card.image_uri ? (
          <CardMagnifier smallSrc={thumb} largeSrc={card.image_uri} alt={card.name} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-cream-dim/40 text-xs">?</div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 items-center justify-between gap-2 pr-4 min-w-0">
        <div className="min-w-0">
          <div className="flex gap-1 mb-1">
            <ColorSymbols colors={card.colors} size={12} />
          </div>
          <div className="font-medium text-cream truncate">{card.name}</div>
          <div className="text-sm text-cream-dim truncate">{card.type_line}</div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Trend badge */}
          {card.scrymarket_price && (
            <div className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0">
              {card.trend === "up" && (
                <span className="flex items-center justify-center w-full h-full rounded-full bg-red-900/40 text-red-400">↑</span>
              )}
              {card.trend === "down" && (
                <span className="flex items-center justify-center w-full h-full rounded-full bg-green-900/40 text-green-400">↓</span>
              )}
              {card.trend === "neutral" && (
                <span className="flex items-center justify-center w-full h-full rounded-full bg-subtle/40 text-cream-dim/50">→</span>
              )}
            </div>
          )}
          {/* Price */}
          <div className="text-right">
            {card.scrymarket_price ? (
              <div className="text-price font-medium">
                ${parseFloat(card.scrymarket_price).toFixed(2)}
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
