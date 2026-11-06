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

function PadlockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="7" width="10" height="7.5" rx="1.5" />
      {/* Open: the shackle lifts clear of the body on its left side. */}
      <path d={locked ? "M5.5 7V5a2.5 2.5 0 0 1 5 0v2" : "M10.5 7V3.5a2.5 2.5 0 0 0-5 0"} strokeLinecap="round" />
    </svg>
  );
}

/**
 * The card's printing, and whether it's locked. Cards start unlocked: the
 * optimiser may buy any printing. The padlock pins the current one; the
 * printing button opens every in-stock printing of the card, cheapest first,
 * and picking one moves the card to it at its cheapest listing and locks it.
 * Printings load on first open.
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

  const locked = mode === "exact";

  function toggleLock() {
    const next = locked ? "any" : "exact";
    updateItem(item.id, { printingMode: next });
    trackEvent("optimise-line-mode", { mode: next });
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-stretch rounded-lg border border-subtle text-xs" role="group" aria-label={`Printing for ${item.cardName}`}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          title={`${item.setName} — choose a printing`}
          aria-label={`${item.setName} — choose a printing`}
          className="flex min-w-0 items-center gap-1.5 rounded-l-lg px-2 py-1 text-cream-dim transition-colors hover:text-cream"
        >
          <SetSymbol setCode={item.setCode} setName={item.setName} rarity={item.rarity} />
          {/* Phones show the set under the card name instead, so the row's controls fit on one line. */}
          <span className="hidden max-w-[10rem] truncate sm:inline">{item.setName}</span>
          <span className="text-[9px] opacity-60" aria-hidden>▼</span>
        </button>
        <button
          onClick={toggleLock}
          aria-pressed={locked}
          aria-label={locked ? "Locked to this printing — click to allow any" : "Any printing — click to lock to this one"}
          title={locked ? "Locked to this printing — click to allow any" : "Any printing — click to lock to this one"}
          className={`flex items-center rounded-r-lg border-l border-subtle px-2 transition-colors ${
            locked ? "bg-accent/20 text-cream" : "text-cream-dim hover:text-cream"
          }`}
        >
          <PadlockIcon locked={locked} />
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
