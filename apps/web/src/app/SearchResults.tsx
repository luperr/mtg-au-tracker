"use client";

import { useEffect, useRef, useState } from "react";
import { CardMagnifier } from "./CardMagnifier";
import { ColorSymbols } from "./ColorSymbols";
import { TrendBadge } from "./TrendBadge";
import { ViewToggle } from "./ViewToggle";
import { useViewPreference } from "@/lib/hooks/useViewPreference";
import { fmtAUD } from "@/lib/format";
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
      <div className="shrink-0 w-[44px] h-[61px] sm:w-[63px] sm:h-[88px] bg-muted overflow-hidden">
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
          {card.scrymarket_price && <TrendBadge trend={card.trend} size="lg" />}
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
  );
}

function TextRow({ card }: { card: CardSearchResult }) {
  return (
    <a
      href={`/cards/${card.id}`}
      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-subtle bg-surface hover:border-accent hover:bg-muted transition-colors"
    >
      <div className="flex items-center gap-1.5 shrink-0">
        <ColorSymbols colors={card.colors} size={11} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-cream">{card.name}</span>
        <span className="ml-2 text-xs text-cream-dim/60 truncate hidden sm:inline">{card.type_line}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {card.scrymarket_price && <TrendBadge trend={card.trend} size="sm" />}
        <span className="text-xs text-cream-dim/50">{card.printing_count}p</span>
        {card.scrymarket_price ? (
          <span className="text-sm text-price font-medium w-16 text-right">
            {fmtAUD(parseFloat(card.scrymarket_price))}
          </span>
        ) : (
          <span className="text-sm text-cream-dim/40 w-16 text-right">—</span>
        )}
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
  const [view, setView] = useViewPreference();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(initialResults.length);
  const loadingRef = useRef(false);

  useEffect(() => {
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
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-cream-dim/70">
          {totalCount} result{totalCount !== 1 ? "s" : ""}
        </p>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="space-y-1.5">
        {cards.map((card) =>
          view === "card" ? (
            <CardRow key={card.id} card={card} />
          ) : (
            <TextRow key={card.id} card={card} />
          )
        )}
      </div>

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
