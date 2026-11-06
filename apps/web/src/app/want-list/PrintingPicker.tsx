"use client";

import { useEffect, useRef, useState } from "react";
import { useWantList, toWantListItem, type WantListItem } from "@/app/WantListContext";
import { SetSymbol } from "@/app/SetSymbol";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { fmtAUD, trackEvent } from "@/lib/utils";
import { variantBadgeWithFoil } from "@/lib/variant-utils";
import type { StoreListing } from "@/lib/store-listing";
import { useCardHover, useHideCardPreview } from "./CardPreview";

type StorePrinting = StoreListing & { collectorNumber: string };

/** One option per printing: its cheapest listing, and how many stores have it. */
function byPrinting(rows: StorePrinting[]): { listing: StorePrinting; stores: number }[] {
  const out = new Map<string, { listing: StorePrinting; stores: number }>();
  for (const r of rows) {
    const p = out.get(r.printingId);
    if (!p) out.set(r.printingId, { listing: r, stores: 1 });
    else out.set(r.printingId, { listing: r.priceAud < p.listing.priceAud ? r : p.listing, stores: p.stores + 1 });
  }
  return [...out.values()].sort((a, b) => a.listing.priceAud - b.listing.priceAud);
}

/**
 * "This printing ▾ | Any": the left opens every in-stock printing of the card,
 * cheapest first, and picking one pins the card to it at its cheapest listing;
 * the right lets the optimiser choose. Printings load on first open.
 */
export function PrintingPicker({ item }: { item: WantListItem }) {
  const { updateItem, replaceItem } = useWantList();
  const hover = useCardHover();
  const hidePreview = useHideCardPreview();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<{ listing: StorePrinting; stores: number }[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const mode = item.printingMode ?? "any";
  useClickOutside(ref, open, () => setOpen(false));
  useEffect(() => { if (!open) hidePreview(); }, [open, hidePreview]);

  useEffect(() => {
    if (!open || options) return;
    fetch(`/api/cards/store-printings?cardId=${item.cardId}`)
      .then((r) => r.json())
      .then((rows: StorePrinting[]) => setOptions(byPrinting(rows)))
      .catch(() => setOptions([]));
  }, [open, options, item.cardId]);

  function pick(listing: StorePrinting) {
    const same = listing.printingId === item.printingId;
    // Keep the listing the card already has when its printing is picked; otherwise its cheapest one.
    replaceItem(item.id, same ? { ...item, printingMode: "exact" } : {
      ...toWantListItem(listing, { cardId: item.cardId, cardSlug: item.cardSlug, cardName: item.cardName }),
      qty: item.qty,
      printingMode: "exact",
    });
    trackEvent("optimise-line-mode", { mode: "exact", changed: !same });
    setOpen(false);
  }

  const segment = (active: boolean) =>
    `px-2 py-1 transition-colors ${active ? "bg-accent/20 text-cream" : "text-cream-dim hover:text-cream"}`;

  return (
    <div ref={ref} className="relative">
      <div className="flex rounded-lg border border-subtle text-xs" role="group" aria-label={`Printing for ${item.cardName}`}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-pressed={mode === "exact"}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`${segment(mode === "exact")} rounded-l-lg`}
        >
          This<span className="hidden sm:inline"> printing</span> <span className="text-[9px] opacity-60">▼</span>
        </button>
        <button
          onClick={() => { updateItem(item.id, { printingMode: "any" }); trackEvent("optimise-line-mode", { mode: "any" }); }}
          aria-pressed={mode === "any"}
          className={`${segment(mode === "any")} rounded-r-lg`}
        >
          Any
        </button>
      </div>

      {open && (
        <div
          role="listbox"
          aria-label={`Printings of ${item.cardName}`}
          className="absolute left-0 top-full z-30 mt-1 w-[min(20rem,calc(100vw-5rem))] rounded-lg border border-subtle bg-surface shadow-xl shadow-black/50"
        >
          {options === null ? (
            <p className="px-3 py-3 text-xs text-cream-dim">Loading printings…</p>
          ) : options.length === 0 ? (
            <p className="px-3 py-3 text-xs text-cream-dim">No in-stock printings found.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto py-1">
              {options.map(({ listing: p, stores }) => {
                const current = p.printingId === item.printingId;
                const badge = variantBadgeWithFoil(p);
                return (
                  <button
                    key={p.printingId}
                    role="option"
                    aria-selected={current}
                    onClick={() => pick(p)}
                    {...hover(p.imageUri)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted ${
                      current ? "bg-accent/10 text-cream" : "text-cream-dim"
                    }`}
                  >
                    <SetSymbol setCode={p.setCode} setName={p.setName} rarity={p.rarity} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.setName} #{p.collectorNumber}</span>
                      <span className="block text-[11px] opacity-70">
                        {badge && <span className="text-accent-light">{badge} · </span>}
                        {stores} store{stores === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-semibold text-price">from {fmtAUD(p.priceAud)}</span>
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
