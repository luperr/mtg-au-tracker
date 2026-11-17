"use client";

import React, { useState, useRef, useEffect } from "react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useMediaQuery, MOBILE_QUERY } from "@/lib/hooks/useMediaQuery";
import type { WantListItem } from "@/app/WantListContext";
import { fmtAUD } from "@/lib/utils";
import { SetSymbol } from "@/app/SetSymbol";
import { Sheet } from "@/app/Sheet";
import { computePopupPos, CardImagePopup } from "@/app/CardMagnifier";
import { MTG_CARD_ASPECT_RATIO } from "@/lib/config";
import { variantBadge, variantBadgeWithFoil } from "@/lib/variant-utils";
import type { StoreListing } from "@/lib/store-listing";

export type StorePrinting = StoreListing & { collectorNumber: string };

function printingBadge(p: StorePrinting): React.ReactNode {
  const badge = variantBadge({ finish: p.finish, borderColor: p.borderColor, frameEffects: p.frameEffects });
  if (badge) return <span className="ml-1 text-accent/80">· {badge}</span>;
  if (p.isFoil) return <span className="ml-1 text-accent/80">✦</span>;
  return null;
}

/**
 * Every in-stock printing of the item's card, cheapest first, across all stores.
 *
 * On desktop it is a dropdown with hover previews. On phones there is no hover, so it opens
 * as a bottom sheet whose rows carry the art instead, sized for a thumb.
 */
export function PrintingSelector({
  item,
  onSelect,
  variant = "symbol",
}: {
  item: WantListItem;
  onSelect: (p: StorePrinting) => void;
  /** `symbol`: the bare set symbol, for the desktop table. `chip`: a labelled, tappable pill for phone rows. */
  variant?: "symbol" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const [printings, setPrintings] = useState<StorePrinting[] | null>(null);
  const [printingPreview, setPrintingPreview] = useState<{ uri: string; top: number; left: number } | null>(null);
  const loadedRef = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const mobile = useMediaQuery(MOBILE_QUERY);

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

  // The sheet has its own backdrop; outside-click only matters for the dropdown.
  useClickOutside(ref, open && !mobile, () => setOpen(false));

  function showPrintingPreview(uri: string, e: React.MouseEvent<HTMLButtonElement>) {
    const { top, left } = computePopupPos(e.currentTarget.getBoundingClientRect(), 244, 340);
    setPrintingPreview({ uri, top, left });
  }

  function select(p: StorePrinting) {
    onSelect(p);
    setOpen(false);
  }

  const itemBadge = variantBadgeWithFoil(item);
  const status = printings === null
    ? <div className="px-3 py-3 text-xs text-cream-dim/50">Loading…</div>
    : printings.length === 0
    ? <div className="px-3 py-3 text-xs text-cream-dim/50">No in-stock printings found</div>
    : null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        title={`${item.setName}${itemBadge ? ` (${itemBadge})` : ""} — click to change printing or store`}
        className={variant === "chip"
          ? "flex h-8 items-center gap-1 rounded border border-subtle bg-muted px-2 text-xs text-cream-dim active:bg-subtle"
          : "flex items-center gap-0.5 hover:opacity-70 transition-opacity"}
      >
        <SetSymbol setCode={item.setCode} setName={item.setName} rarity={item.rarity} />
        {variant === "chip" && (
          <span className="uppercase">{item.setCode}{itemBadge && <span className="ml-1 normal-case text-accent/80">{itemBadge}</span>}</span>
        )}
        <span className={variant === "chip" ? "text-[10px] text-cream-dim/50" : "text-[8px] text-cream-dim/30"}>▼</span>
      </button>

      {mobile ? (
        <Sheet open={open} onClose={() => setOpen(false)} side="bottom" title={`Change printing — ${item.cardName}`}>
          {status ?? (
            <ul className="pb-2">
              {printings!.map((p) => {
                const isCurrent = p.printingId === item.printingId && p.storeId === item.storeId;
                return (
                  <li key={`${p.printingId}-${p.storeId}`}>
                    <button
                      onClick={() => select(p)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left active:bg-muted ${isCurrent ? "bg-muted/60" : ""}`}
                    >
                      {p.imageUri ? (
                        <img src={p.imageUri} alt="" loading="lazy" className="w-10 shrink-0 rounded" style={{ aspectRatio: MTG_CARD_ASPECT_RATIO }} />
                      ) : (
                        <div className="w-10 shrink-0 rounded bg-muted" style={{ aspectRatio: MTG_CARD_ASPECT_RATIO }} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-sm text-cream">
                          <SetSymbol setCode={p.setCode} setName={p.setName} rarity={p.rarity} />
                          <span className="truncate">{p.setName}</span>
                        </span>
                        <span className="block truncate text-xs text-cream-dim">
                          #{p.collectorNumber}{printingBadge(p)} · {p.storeName}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-price tabular-nums">{fmtAUD(p.priceAud)}</span>
                      {isCurrent && <span className="shrink-0 text-xs text-price" aria-label="Current">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Sheet>
      ) : (
        <>
          {/* Card image preview — fixed so it escapes overflow clipping */}
          {printingPreview && (
            <CardImagePopup uri={printingPreview.uri} top={printingPreview.top} left={printingPreview.left} width={244} zIndex={60} />
          )}

          {open && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[280px] rounded-lg border border-subtle bg-surface shadow-xl shadow-black/50">
              {status ?? (
                <div className="py-1 max-h-64 overflow-y-auto">
                  {printings!.map((p) => {
                    const isCurrent = p.printingId === item.printingId && p.storeId === item.storeId;
                    return (
                      <button
                        key={`${p.printingId}-${p.storeId}`}
                        onClick={() => select(p)}
                        onMouseEnter={p.imageUri ? (e) => showPrintingPreview(p.imageUri!, e) : undefined}
                        onMouseLeave={() => setPrintingPreview(null)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted ${
                          isCurrent ? "text-cream" : "text-cream-dim"
                        }`}
                      >
                        <SetSymbol setCode={p.setCode} setName={p.setName} rarity={p.rarity} />
                        <span className="flex-1 truncate">
                          {p.setName} #{p.collectorNumber}
                          {printingBadge(p)}
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
        </>
      )}
    </div>
  );
}
