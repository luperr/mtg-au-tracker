"use client";

import React, { useState, useRef, useEffect } from "react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import type { WantListItem } from "@/app/WantListContext";
import { fmtAUD } from "@/lib/utils";
import { SetSymbol } from "@/app/SetSymbol";
import { computePopupPos, CardImagePopup } from "@/app/CardMagnifier";
import { variantBadge, variantBadgeWithFoil } from "@/lib/variant-utils";
import type { StoreListing } from "@/lib/store-listing";

export type StorePrinting = StoreListing & { collectorNumber: string };

export function PrintingSelector({
  item,
  onSelect,
}: {
  item: WantListItem;
  onSelect: (p: StorePrinting) => void;
}) {
  const [open, setOpen] = useState(false);
  const [printings, setPrintings] = useState<StorePrinting[] | null>(null);
  const [printingPreview, setPrintingPreview] = useState<{ uri: string; top: number; left: number } | null>(null);
  const loadedRef = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    fetch(`/api/cards/store-printings?cardId=${item.cardId}`)
      .then((r) => r.json())
      .then((rows: StorePrinting[]) =>
        // Sort cheapest first
        [...rows].sort((a, b) => a.priceAud - b.priceAud)
      )
      .then(setPrintings)
      .catch(() => setPrintings([]));
  }, [open, item.cardId]);

  useEffect(() => {
    if (!open) setPrintingPreview(null);
  }, [open]);

  useClickOutside(ref, open, () => setOpen(false));

  function showPrintingPreview(uri: string, e: React.MouseEvent<HTMLButtonElement>) {
    const { top, left } = computePopupPos(e.currentTarget.getBoundingClientRect(), 244, 340);
    setPrintingPreview({ uri, top, left });
  }

  const itemBadge = variantBadgeWithFoil(item);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        title={`${item.setName}${itemBadge ? ` (${itemBadge})` : ""} — click to change printing or store`}
        className="flex items-center gap-0.5 hover:opacity-70 transition-opacity"
      >
        <SetSymbol setCode={item.setCode} setName={item.setName} rarity={item.rarity} />
        <span className="text-[8px] text-cream-dim/30">▼</span>
      </button>

      {/* Card image preview — fixed so it escapes overflow clipping */}
      {printingPreview && (
        <CardImagePopup uri={printingPreview.uri} top={printingPreview.top} left={printingPreview.left} width={244} zIndex={60} />
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[280px] rounded-lg border border-subtle bg-surface shadow-xl shadow-black/50">
          {printings === null ? (
            <div className="px-3 py-3 text-xs text-cream-dim/50">Loading…</div>
          ) : printings.length === 0 ? (
            <div className="px-3 py-3 text-xs text-cream-dim/50">No in-stock printings found</div>
          ) : (
            <div className="py-1 max-h-64 overflow-y-auto">
              {printings.map((p) => {
                const isCurrent = p.printingId === item.printingId && p.storeId === item.storeId;
                return (
                  <button
                    key={`${p.printingId}-${p.storeId}`}
                    onClick={() => { onSelect(p); setOpen(false); }}
                    onMouseEnter={p.imageUri ? (e) => showPrintingPreview(p.imageUri!, e) : undefined}
                    onMouseLeave={() => setPrintingPreview(null)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted ${
                      isCurrent ? "text-cream" : "text-cream-dim"
                    }`}
                  >
                    <SetSymbol setCode={p.setCode} setName={p.setName} rarity={p.rarity} />
                    <span className="flex-1 truncate">
                      {p.setName} #{p.collectorNumber}
                      {(() => {
                        const badge = variantBadge({ finish: p.finish, borderColor: p.borderColor, frameEffects: p.frameEffects });
                        if (badge) return <span className="ml-1 text-accent/80">· {badge}</span>;
                        if (p.isFoil) return <span className="ml-1 text-accent/80">✦</span>;
                        return null;
                      })()}
                    </span>
                    <span className="text-cream-dim/40 text-[10px] shrink-0">{p.storeName}</span>
                    <span className="text-price font-semibold whitespace-nowrap">{fmtAUD(p.priceAud)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
