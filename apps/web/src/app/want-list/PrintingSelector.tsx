"use client";

import React, { useState, useRef, useEffect } from "react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import type { WantListItem } from "@/app/WantListContext";
import { fmtAUD } from "@/lib/utils";
import { SetSymbol } from "@/app/SetSymbol";
import { Sheet } from "@/app/Sheet";
import { CardThumb } from "@/app/CardThumb";
import { computePopupPos, CardImagePopup } from "@/app/CardMagnifier";
import { variantBadge, variantBadgeWithFoil } from "@/lib/variant-utils";
import type { StoreListing } from "@/lib/store-listing";

export type StorePrinting = StoreListing & { collectorNumber: string };

/** Every in-stock printing of the card across all stores, cheapest first — fetched on first open. */
function usePrintings(cardId: string, open: boolean): StorePrinting[] | null {
  const [printings, setPrintings] = useState<StorePrinting[] | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    fetch(`/api/cards/store-printings?cardId=${cardId}`)
      .then((r) => r.json())
      .then((rows: StorePrinting[]) => [...rows].sort((a, b) => a.priceAud - b.priceAud))
      .then(setPrintings)
      .catch(() => setPrintings([]));
  }, [open, cardId]);

  return printings;
}

function printingBadge(p: StorePrinting): React.ReactNode {
  const badge = variantBadge({ finish: p.finish, borderColor: p.borderColor, frameEffects: p.frameEffects });
  if (badge) return <span className="ml-1 text-accent/80">· {badge}</span>;
  if (p.isFoil) return <span className="ml-1 text-accent/80">✦</span>;
  return null;
}

type ListProps = {
  item: WantListItem;
  printings: StorePrinting[];
  onSelect: (p: StorePrinting) => void;
};

const isCurrent = (p: StorePrinting, item: WantListItem) => p.printingId === item.printingId && p.storeId === item.storeId;
const printingKey = (p: StorePrinting) => `${p.printingId}-${p.storeId}`;

/** Phone rows: art instead of a hover preview, sized for a thumb. */
function SheetRows({ item, printings, onSelect }: ListProps) {
  return (
    <ul className="pb-2">
      {printings.map((p) => (
        <li key={printingKey(p)}>
          <button
            onClick={() => onSelect(p)}
            className={`flex w-full items-center gap-3 px-4 py-2 text-left active:bg-muted ${isCurrent(p, item) ? "bg-muted/60" : ""}`}
          >
            <CardThumb uri={p.imageUri} className="w-10 shrink-0" />
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
            {isCurrent(p, item) && <span className="shrink-0 text-xs text-price" aria-label="Current">✓</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Desktop rows, with a full-size preview of each printing on hover. */
function DropdownRows({ item, printings, onSelect }: ListProps) {
  const [preview, setPreview] = useState<{ uri: string; top: number; left: number } | null>(null);

  function showPreview(uri: string, e: React.MouseEvent<HTMLButtonElement>) {
    const { top, left } = computePopupPos(e.currentTarget.getBoundingClientRect(), 244, 340);
    setPreview({ uri, top, left });
  }

  return (
    <div className="py-1 max-h-64 overflow-y-auto">
      {/* Fixed so it escapes the list's overflow clipping */}
      {preview && <CardImagePopup uri={preview.uri} top={preview.top} left={preview.left} width={244} zIndex={60} />}
      {printings.map((p) => (
        <button
          key={printingKey(p)}
          onClick={() => onSelect(p)}
          onMouseEnter={p.imageUri ? (e) => showPreview(p.imageUri!, e) : undefined}
          onMouseLeave={() => setPreview(null)}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted ${
            isCurrent(p, item) ? "text-cream" : "text-cream-dim"
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
      ))}
    </div>
  );
}

/**
 * Change an item's printing or store.
 *
 * `variant` names the layout it sits in, and that decides the picker too: `symbol` is the
 * desktop table's bare set symbol, opening a dropdown with hover previews; `chip` is the
 * phone row's labelled pill, opening a bottom sheet, since touch has no hover.
 */
export function PrintingSelector({
  item,
  onSelect,
  variant = "symbol",
}: {
  item: WantListItem;
  onSelect: (p: StorePrinting) => void;
  variant?: "symbol" | "chip";
}) {
  const [open, setOpen] = useState(false);
  // The sheet stays mounted once opened so it can animate closed, but a list of N items
  // shouldn't carry N closed overlays before anyone taps one.
  const [sheetMounted, setSheetMounted] = useState(false);
  const printings = usePrintings(item.cardId, open);
  const ref = useRef<HTMLDivElement>(null);
  const chip = variant === "chip";

  // The sheet has its own backdrop; outside-click only matters for the dropdown.
  useClickOutside(ref, open && !chip, () => setOpen(false));

  function toggle() {
    if (chip) setSheetMounted(true);
    setOpen(!open);
  }

  function select(p: StorePrinting) {
    onSelect(p);
    setOpen(false);
  }

  const itemBadge = variantBadgeWithFoil(item);
  const body = printings === null
    ? <div className="px-3 py-3 text-xs text-cream-dim/50">Loading…</div>
    : printings.length === 0
    ? <div className="px-3 py-3 text-xs text-cream-dim/50">No in-stock printings found</div>
    : null;
  const listProps = printings ? { item, printings, onSelect: select } : null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={toggle}
        title={`${item.setName}${itemBadge ? ` (${itemBadge})` : ""} — click to change printing or store`}
        className={chip
          ? "flex h-8 items-center gap-1 rounded border border-subtle bg-muted px-2 text-xs text-cream-dim active:bg-subtle"
          : "flex items-center gap-0.5 hover:opacity-70 transition-opacity"}
      >
        <SetSymbol setCode={item.setCode} setName={item.setName} rarity={item.rarity} />
        {chip && (
          <span className="uppercase">{item.setCode}{itemBadge && <span className="ml-1 normal-case text-accent/80">{itemBadge}</span>}</span>
        )}
        <span className={chip ? "text-[10px] text-cream-dim/50" : "text-[8px] text-cream-dim/30"}>▼</span>
      </button>

      {chip && sheetMounted && (
        <Sheet open={open} onClose={() => setOpen(false)} side="bottom" title={`Change printing — ${item.cardName}`}>
          {body ?? <SheetRows {...listProps!} />}
        </Sheet>
      )}

      {!chip && open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[280px] rounded-lg border border-subtle bg-surface shadow-xl shadow-black/50">
          {body ?? <DropdownRows {...listProps!} />}
        </div>
      )}
    </div>
  );
}
