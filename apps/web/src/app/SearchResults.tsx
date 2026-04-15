"use client";

import { useEffect, useRef, useState } from "react";
import { CardMagnifier, HoverCardPopup } from "./CardMagnifier";
import { ColorSymbols } from "./ColorSymbols";
import { TrendBadge } from "./TrendBadge";
import { ViewToggle } from "./ViewToggle";
import { useViewPreference } from "@/lib/hooks/useViewPreference";
import { fmtAUD, cardHref, toSmallImage, trackEvent } from "@/lib/utils";
import { MTG_CARD_ASPECT_RATIO } from "@/lib/config";
import { useWantList } from "@/app/WantListContext";
import type { CardSearchResult } from "@/lib/db";

// ── Shared want-list button ───────────────────────────────────────────────────

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
  );
}

// ── View 1: Image grid ────────────────────────────────────────────────────────
// Card art dominant, dynamic responsive grid, name + price + want-list below.

function GridCard({ card }: { card: CardSearchResult }) {
  return (
    <div className="flex flex-col rounded-lg overflow-hidden border border-subtle bg-surface hover:border-accent transition-colors group">
      {/* Card image — use normal-size image; small (146px) blurs at 4-col grid widths */}
      <a
        href={cardHref(card.slug, card.id)}
        onClick={() => trackEvent("card-click", { card: card.name })}
        className="block w-full overflow-hidden"
      >
        {card.image_uri ? (
          <img
            src={card.image_uri}
            alt={card.name}
            className="w-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
            style={{ aspectRatio: MTG_CARD_ASPECT_RATIO }}
            loading="lazy"
          />
        ) : (
          <div
            className="w-full bg-muted flex items-center justify-center text-cream-dim/30 text-xs"
            style={{ aspectRatio: MTG_CARD_ASPECT_RATIO }}
          >
            No image
          </div>
        )}
      </a>

      {/* Footer: name · price · want-list */}
      <div className="px-2 pt-1.5 pb-2 flex flex-col gap-1 bg-surface">
        <a
          href={cardHref(card.slug, card.id)}
          onClick={() => trackEvent("card-click", { card: card.name })}
          className="text-xs font-medium text-cream truncate hover:text-accent-light transition-colors"
        >
          {card.name}
        </a>
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5">
            {card.scrymarket_price && <TrendBadge trend={card.trend} size="sm" />}
            {card.scrymarket_price ? (
              <span className="text-sm font-semibold text-price tabular-nums">
                {fmtAUD(parseFloat(card.scrymarket_price))}
              </span>
            ) : (
              <span className="text-xs text-cream-dim/40">no prices</span>
            )}
          </div>
          <AddToWantListButton card={card} />
        </div>
      </div>
    </div>
  );
}

// ── View 2: Card rows (thumbnail + info) ──────────────────────────────────────

function CardRow({ card }: { card: CardSearchResult }) {
  const thumb = toSmallImage(card.image_uri);
  return (
    <div className="relative flex items-center rounded-lg border border-subtle bg-surface hover:border-accent hover:bg-muted transition-colors overflow-hidden">
      <a
        href={cardHref(card.slug, card.id)}
        onClick={() => trackEvent("card-click", { card: card.name })}
        className="flex flex-1 items-center gap-3 min-w-0 pr-14"
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
        <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
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

      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        <AddToWantListButton card={card} />
      </div>
    </div>
  );
}

// ── View 3: Text rows (minimal, no images) ────────────────────────────────────

function TextRow({ card }: { card: CardSearchResult }) {
  return (
    <div className="relative flex items-center rounded-lg border border-subtle bg-surface hover:border-accent hover:bg-muted transition-colors">
      <a
        href={cardHref(card.slug, card.id)}
        onClick={() => trackEvent("card-click", { card: card.name })}
        className="flex flex-1 items-center gap-3 px-3 py-2 min-w-0 pr-12"
      >
        <div className="flex items-center gap-1 shrink-0">
          <ColorSymbols colors={card.colors} size={11} />
        </div>
        <div className="flex-1 min-w-0">
          {card.image_uri ? (
            <HoverCardPopup imageSrc={card.image_uri} alt={card.name} delay={500}>
              <span className="font-medium text-cream">{card.name}</span>
            </HoverCardPopup>
          ) : (
            <span className="font-medium text-cream">{card.name}</span>
          )}
          <span className="ml-2 text-xs text-cream-dim/60 hidden sm:inline">{card.type_line}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {card.scrymarket_price && <TrendBadge trend={card.trend} size="sm" />}
          <span className="text-xs text-cream-dim/40">{card.printing_count}p</span>
          {card.scrymarket_price ? (
            <span className="text-sm text-price font-medium w-16 text-right tabular-nums">
              {fmtAUD(parseFloat(card.scrymarket_price))}
            </span>
          ) : (
            <span className="text-sm text-cream-dim/40 w-16 text-right">—</span>
          )}
        </div>
      </a>
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <AddToWantListButton card={card} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
    if (query) trackEvent("card-search", { query });
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
      {/* Header: result count + view toggle */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-cream-dim/70">
          {totalCount} result{totalCount !== 1 ? "s" : ""}
        </p>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* Grid view */}
      {view === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {cards.map((card) => (
            <GridCard key={card.id} card={card} />
          ))}
        </div>
      )}

      {/* Card row view */}
      {view === "card" && (
        <div className="space-y-1.5">
          {cards.map((card) => (
            <CardRow key={card.id} card={card} />
          ))}
        </div>
      )}

      {/* Text view */}
      {view === "text" && (
        <div className="space-y-1">
          {cards.map((card) => (
            <TextRow key={card.id} card={card} />
          ))}
        </div>
      )}

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
