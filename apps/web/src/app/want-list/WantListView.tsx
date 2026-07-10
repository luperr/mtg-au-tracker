"use client";

import React, { useState, useRef, useEffect } from "react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useWantList, toWantListItem, type WantListItem } from "@/app/WantListContext";
import { fmtAUD } from "@/lib/utils";
import { STORE_FLAT_SHIPPING_AUD } from "@/lib/store-shipping";
import { SetSymbol } from "@/app/SetSymbol";
import { BuyLink } from "@/app/BuyLink";
import { computePopupPos, CardImagePopup } from "@/app/CardMagnifier";
import { ImportCards } from "./ImportCards";
import type { OptimizeResult } from "@/app/api/optimize/route";
import { cardHref } from "@/lib/utils";
import { variantBadge, variantBadgeWithFoil } from "@/lib/variant-utils";
import type { StoreListing } from "@/lib/store-listing";

// ── Printing selector ─────────────────────────────────────────────────────────

type StorePrinting = StoreListing & { collectorNumber: string };

function PrintingSelector({
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

// ── Editable postage row ──────────────────────────────────────────────────────

function EditablePostageRow({
  amount,
  isOverride,
  onSave,
}: {
  amount: number | null;
  isOverride: boolean;
  onSave: (amount: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEdit() {
    setDraft(amount !== null ? String(amount) : "");
    setEditing(true);
  }

  function commit() {
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) onSave(n);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-cream-dim/50">
        <span>Postage: $</span>
        <input
          autoFocus
          type="number"
          min="0"
          step="0.50"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="w-14 bg-muted border border-accent-border rounded px-1 py-0.5 text-cream text-xs text-right [appearance:textfield]"
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onSave(0); setEditing(false); }}
          className="text-[10px] text-cream-dim/40 hover:text-green-400 transition-colors whitespace-nowrap"
        >
          In-store
        </button>
        {isOverride && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onSave(null); setEditing(false); }}
            className="text-[10px] text-cream-dim/30 hover:text-cream-dim/60 transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-xs text-cream-dim/50">
      <button
        onClick={startEdit}
        title="Click to edit postage"
        className="flex items-center gap-1 bg-muted border border-accent-border rounded px-1.5 py-0.5 hover:border-accent-light/50 hover:text-cream-dim transition-colors cursor-pointer"
      >
        {amount === null
          ? "Postage: unknown"
          : amount === 0
          ? "Postage: free (in-store)"
          : `Postage: ${fmtAUD(amount)}`}
        {isOverride && <span className="ml-1 text-[9px] text-accent-light/60">·edited</span>}
      </button>
      {!isOverride && amount !== null && (
        <span
          className="cursor-help text-[10px] text-cream-dim/30"
          title="Estimated. Postage is charged once per order and the actual amount may vary at checkout."
        >
          ⓘ
        </span>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByStore(items: WantListItem[]): Map<string, WantListItem[]> {
  const map = new Map<string, WantListItem[]>();
  for (const item of items) {
    const group = map.get(item.storeName) ?? [];
    group.push(item);
    map.set(item.storeName, group);
  }
  return map;
}

/** Returns the shipping charge for a store group.
 *  eBay items are per-seller so each row has its own shippingAud → sum them.
 *  Other stores charge flat rate per order — user overrides take precedence,
 *  then DB value, then static config. */
function getStoreShipping(
  items: WantListItem[],
  overrides: Record<string, number>
): { isPerItem: boolean; flatAmount: number | null } {
  const storeId = items[0]?.storeId ?? "";
  if (storeId === "ebay_au") {
    return { isPerItem: true, flatAmount: null };
  }
  if (storeId in overrides) {
    return { isPerItem: false, flatAmount: overrides[storeId] };
  }
  const fromDb = items.find((i) => i.shippingAud !== null)?.shippingAud;
  const flatAmount = fromDb !== undefined ? fromDb : (STORE_FLAT_SHIPPING_AUD[storeId] ?? null);
  return { isPerItem: false, flatAmount };
}

// ── Optimise modal ────────────────────────────────────────────────────────────

function OptimiseModal({
  result,
  loading,
  currentItems,
  currentPostage,
  lockedPrintingIds,
  checkedCardIds,
  unchangedExpanded,
  onToggleLock,
  onToggleChecked,
  onToggleAll,
  onReoptimise,
  onApply,
  onDismiss,
  onToggleUnchanged,
}: {
  result: OptimizeResult | null;
  loading: boolean;
  currentItems: WantListItem[];
  currentPostage: number;
  lockedPrintingIds: Set<string>;
  checkedCardIds: Set<string>;
  unchangedExpanded: boolean;
  onToggleLock: (cardId: string) => void;
  onToggleChecked: (cardId: string) => void;
  onToggleAll: (cardIds: string[]) => void;
  onReoptimise: () => void;
  onApply: () => void;
  onDismiss: () => void;
  onToggleUnchanged: () => void;
}) {
  const currentByCardId = new Map(currentItems.map((i) => [i.cardId, i]));

  const changed = result?.assignments.filter((a) => {
    const cur = currentByCardId.get(a.cardId);
    return cur && (a.printingId !== cur.printingId || a.storeId !== cur.storeId);
  }) ?? [];

  const unchanged = result?.assignments.filter((a) => {
    const cur = currentByCardId.get(a.cardId);
    return !cur || (a.printingId === cur.printingId && a.storeId === cur.storeId);
  }) ?? [];

  const currentTotal = currentItems.reduce((s, i) => s + i.priceAud, 0);
  const savings = result ? (currentTotal + currentPostage) - result.totalCost : 0;
  const checkedCount = changed.filter((a) => checkedCardIds.has(a.cardId)).length;
  const allChecked = changed.length > 0 && checkedCount === changed.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onDismiss} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md flex flex-col max-h-[85vh] rounded-xl border border-subtle bg-surface shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-cream">Optimise plan</span>
            {savings > 0.005 && (
              <span className="text-xs text-green-400 font-bold bg-green-900/20 px-2 py-0.5 rounded-full">
                save {fmtAUD(savings)}
              </span>
            )}
            {result && savings <= 0.005 && (
              <span className="text-xs text-cream-dim/40">already optimal</span>
            )}
          </div>
          <button
            onClick={onDismiss}
            className="text-cream-dim/40 hover:text-cream transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Summary bar */}
        {result && (
          <div className="px-4 py-2 border-b border-subtle/50 bg-cream-muted/20 shrink-0 text-xs text-cream-dim/60">
            Current: <span className="text-cream-dim">{fmtAUD(currentTotal + currentPostage)}</span>
            {currentPostage > 0 && (
              <span className="ml-1 text-cream-dim/40">(~{fmtAUD(currentPostage)} postage)</span>
            )}
            <span className="mx-1.5 text-cream-dim/30">→</span>
            Optimised: <span className="text-price font-semibold">{fmtAUD(result.totalCost)}</span>
            {result.totalPostage > 0 && (
              <span className="ml-1 text-cream-dim/40">(~{fmtAUD(result.totalPostage)} postage)</span>
            )}
          </div>
        )}

        {/* Card list — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16 text-cream-dim/40 text-sm">
              Optimising…
            </div>
          )}

          {!loading && result && (
            <>
              {/* Changed cards */}
              {changed.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-cream-dim/40">
                  Your list is already optimally assigned.
                </div>
              )}
              {changed.length > 0 && (
                <div className="divide-y divide-subtle/40">
                  {changed.map((a, idx) => {
                    const cur = currentByCardId.get(a.cardId)!;
                    const isLocked = lockedPrintingIds.has(cur.printingId);
                    const isChecked = !isLocked && checkedCardIds.has(a.cardId);
                    // When locked, display the original (current) printing; otherwise show optimised
                    const display = isLocked ? cur : a;
                    const printingChanged = !isLocked && a.printingId !== cur.printingId;
                    const priceDelta = a.priceAud - cur.priceAud;
                    const curBadge = variantBadgeWithFoil(cur);
                    const aBadge = variantBadgeWithFoil(a);

                    return (
                      <div key={`${a.cardId}-${a.printingId}-${a.storeId}-${idx}`} className={`flex items-center gap-2 px-3 py-2.5 transition-opacity ${isLocked ? "opacity-50" : ""}`}>
                        {/* Checkbox — hidden when locked */}
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isLocked}
                          onChange={() => onToggleChecked(a.cardId)}
                          className="shrink-0 accent-[var(--color-price)]"
                        />

                        {/* Lock button */}
                        <button
                          onClick={() => onToggleLock(a.cardId)}
                          title={isLocked ? "Unlock — allow optimizer to change printing" : "Lock to current printing"}
                          className={`shrink-0 text-sm leading-none transition-colors ${
                            isLocked ? "text-amber-400" : "text-cream-dim/20 hover:text-cream-dim/50"
                          }`}
                        >
                          {isLocked ? "🔒" : "🔓"}
                        </button>

                        {/* Set icon — reverts to original when locked */}
                        <SetSymbol setCode={display.setCode} setName={display.setName} rarity={display.rarity} />

                        {/* Card name + change summary */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-cream font-medium truncate">{a.cardName}</div>
                          <div className="text-[10px] text-cream-dim/40 mt-0.5 truncate">
                            {isLocked ? (
                              <span className="text-cream-dim/30">locked · {cur.storeName}</span>
                            ) : (
                              <>
                                {cur.storeName}{printingChanged && <> · {cur.setName}{curBadge && <> · {curBadge}</>}</>}
                                <span className="mx-1">→</span>
                                <span className="text-cream-dim/70">{a.storeName}</span>
                                {printingChanged && <span className="text-cream-dim/70"> · {a.setName}{aBadge && ` · ${aBadge}`}</span>}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Price + delta — show original price when locked */}
                        <div className="text-right shrink-0">
                          <div className="text-xs text-price font-semibold">{fmtAUD(display.priceAud)}</div>
                          {!isLocked && Math.abs(priceDelta) > 0.005 && (
                            <div className={`text-[10px] ${priceDelta < 0 ? "text-green-400" : "text-red-400/70"}`}>
                              {priceDelta < 0 ? "" : "+"}{fmtAUD(priceDelta)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Unchanged cards — collapsed by default */}
              {unchanged.length > 0 && (
                <div className="border-t border-subtle/40">
                  <button
                    onClick={onToggleUnchanged}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-cream-dim/30 hover:text-cream-dim/50 transition-colors"
                  >
                    <span>{unchangedExpanded ? "▼" : "▶"}</span>
                    <span>{unchanged.length} card{unchanged.length !== 1 ? "s" : ""} unchanged</span>
                  </button>
                  {unchangedExpanded && (
                    <div className="divide-y divide-subtle/20">
                      {unchanged.map((a, idx) => (
                        <div key={`${a.cardId}-${a.printingId}-${a.storeId}-${idx}`} className="flex items-center gap-2 px-3 py-1.5 opacity-40">
                          <SetSymbol setCode={a.setCode} setName={a.setName} rarity={a.rarity} />
                          <span className="text-xs text-cream-dim flex-1 truncate">{a.cardName}</span>
                          <span className="text-xs text-price">{fmtAUD(a.priceAud)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {result.unavailable.length > 0 && (
                <div className="px-4 py-2 border-t border-subtle/40">
                  <p className="text-[10px] text-amber-400/60">
                    No listings found: {result.unavailable.join(", ")}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-subtle shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2">
          {lockedPrintingIds.size > 0 && (
            <button
              onClick={onReoptimise}
              disabled={loading}
              className="rounded-lg border border-accent-border bg-accent-muted/40 px-3 py-1.5 text-xs font-semibold text-accent-light hover:bg-accent-muted transition-colors disabled:opacity-50"
            >
              Re-optimise
            </button>
          )}
          {changed.length > 0 && (
            <button
              onClick={() => onToggleAll(changed.map((a) => a.cardId))}
              className="text-xs text-cream-dim/40 hover:text-cream-dim transition-colors"
            >
              {allChecked ? "Deselect all" : "Select all"}
            </button>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onDismiss}
              className="text-xs text-cream-dim/40 hover:text-cream-dim transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={onApply}
              disabled={checkedCount === 0 || loading}
              className="rounded-lg bg-price text-bg px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Apply selected ({checkedCount})
            </button>
          </div>
        </div>

        {/* Algorithm footnote — hidden on mobile to avoid clipping */}
        <div className="hidden sm:block px-4 pb-2.5 shrink-0">
          <p className="text-[10px] text-cream-dim/25 leading-relaxed">
            Searches all in-stock printings across all stores. Flat-rate store postage is shared — the more cards from one store, the better the economics. Lock a card to pin it to its current printing, then re-optimise.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WantListView() {
  const { items, removeItem, addItem, clearAll, totalCount, storeShippingOverrides, setStoreShipping } = useWantList();
  const byStore = groupByStore(items);
  const [optimiseOpen, setOptimiseOpen] = useState(false);
  const [cardPreview, setCardPreview] = useState<{ uri: string; top: number; left: number } | null>(null);

  function showCardPreview(uri: string, e: React.MouseEvent<HTMLElement>) {
    const { top, left } = computePopupPos(e.currentTarget.getBoundingClientRect(), 244, 340);
    setCardPreview({ uri, top, left });
  }
  const [optimiseLoading, setOptimiseLoading] = useState(false);
  const [optimiseResult, setOptimiseResult] = useState<OptimizeResult | null>(null);
  const [lockedPrintingIds, setLockedPrintingIds] = useState<Set<string>>(new Set());
  const [checkedCardIds, setCheckedCardIds] = useState<Set<string>>(new Set());
  const [unchangedExpanded, setUnchangedExpanded] = useState(false);
  const [collapsedStores, setCollapsedStores] = useState<Set<string>>(new Set());

  function toggleStore(storeName: string) {
    setCollapsedStores((prev) => {
      const next = new Set(prev);
      if (next.has(storeName)) next.delete(storeName);
      else next.add(storeName);
      return next;
    });
  }

  async function runOptimise(locked: Set<string>) {
    setOptimiseLoading(true);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ cardId: i.cardId, cardName: i.cardName, printingId: i.printingId })),
          lockedPrintingIds: [...locked],
          shippingOverrides: storeShippingOverrides,
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as OptimizeResult;
      setOptimiseResult(data);
      // Default: check all changed cards
      const currentByCardId = new Map(items.map((i) => [i.cardId, i]));
      setCheckedCardIds(new Set(
        data.assignments
          .filter((a) => {
            const cur = currentByCardId.get(a.cardId);
            return cur && (a.printingId !== cur.printingId || a.storeId !== cur.storeId);
          })
          .map((a) => a.cardId)
      ));
    } catch {
      // keep modal open, result stays null — loading spinner disappears
    } finally {
      setOptimiseLoading(false);
    }
  }

  function handleOptimise() {
    setOptimiseOpen(true);
    setOptimiseResult(null);
    setLockedPrintingIds(new Set());
    setCheckedCardIds(new Set());
    setUnchangedExpanded(false);
    runOptimise(new Set());
  }

  function handleReoptimise() {
    runOptimise(lockedPrintingIds);
  }

  function handleToggleLock(cardId: string) {
    const cur = items.find((i) => i.cardId === cardId);
    if (!cur) return;
    setLockedPrintingIds((prev) => {
      const next = new Set(prev);
      if (next.has(cur.printingId)) next.delete(cur.printingId);
      else next.add(cur.printingId);
      return next;
    });
  }

  function handleToggleChecked(cardId: string) {
    setCheckedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function handleToggleAll(cardIds: string[]) {
    const allChecked = cardIds.every((id) => checkedCardIds.has(id));
    if (allChecked) {
      setCheckedCardIds((prev) => {
        const next = new Set(prev);
        cardIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setCheckedCardIds((prev) => new Set([...prev, ...cardIds]));
    }
  }

  function applyOptimisedPlan() {
    if (!optimiseResult) return;
    for (const a of optimiseResult.assignments) {
      if (!checkedCardIds.has(a.cardId)) continue;
      const current = items.find((i) => i.cardId === a.cardId);
      if (!current) continue;
      if (current.storeId === a.storeId && current.printingId === a.printingId) continue;
      removeItem(current.id);
      addItem(toWantListItem(a, current));
    }
    setOptimiseOpen(false);
    setOptimiseResult(null);
    setLockedPrintingIds(new Set());
  }

  // Compute totals
  let grandCards = 0;
  let grandPostage = 0;
  for (const storeItems of byStore.values()) {
    grandCards += storeItems.reduce((s, i) => s + i.priceAud, 0);
    const { isPerItem, flatAmount } = getStoreShipping(storeItems, storeShippingOverrides);
    if (isPerItem) {
      grandPostage += storeItems.reduce((s, i) => s + (i.shippingAud ?? 0), 0);
    } else {
      grandPostage += flatAmount ?? 0;
    }
  }
  const grandTotal = grandCards + grandPostage;
  const hasUnknownPostage = Array.from(byStore.values()).some(
    (storeItems) => !getStoreShipping(storeItems, storeShippingOverrides).isPerItem && getStoreShipping(storeItems, storeShippingOverrides).flatAmount === null
  );

  function handlePrintingChange(item: WantListItem, p: StorePrinting) {
    removeItem(item.id);
    addItem(toWantListItem(p, item));
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cream">Want List</h1>
          {totalCount > 0 && (
            <p className="text-sm text-cream-dim/60 mt-0.5">
              {totalCount} item{totalCount !== 1 ? "s" : ""} ·{" "}
              <span className="text-price font-semibold">{fmtAUD(grandCards)}</span>
              {grandPostage > 0 && (
                <span className="text-cream-dim/40"> + ~{fmtAUD(grandPostage)} postage</span>
              )}
            </p>
          )}
        </div>
        {totalCount > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={handleOptimise}
                title="Finds the cheapest available printing of each card across all stores. Lock cards in the review screen to keep their current printing."
                className="rounded-lg border border-accent-border bg-accent-muted/40 px-3 py-1.5 text-xs font-semibold text-accent-light hover:bg-accent-muted transition-colors"
              >
                ✦ Optimise
              </button>
              <a
                href="/faq#how-do-i-use-the-want-list-optimiser"
                target="_blank"
                rel="noopener noreferrer"
                title="How does the optimiser work?"
                className="w-4 h-4 rounded-full border border-accent-border text-cream-dim hover:text-cream hover:border-accent transition-colors flex items-center justify-center text-[10px] leading-none"
              >
                ?
              </a>
            </div>
            <button
              onClick={clearAll}
              className="text-xs text-cream-dim/40 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {totalCount === 0 ? (
        <div className="rounded-lg border border-subtle bg-surface px-6 py-12 text-center mb-8">
          <p className="text-cream-dim/50 mb-2">Your want list is empty.</p>
          <p className="text-xs text-cream-dim/30">
            Browse cards and click <span className="text-price">+</span> on any price row to add it here.
          </p>
        </div>
      ) : (
        <div className="space-y-6 mb-8">
          {Array.from(byStore.entries()).map(([storeName, storeItems]) => {
            const { isPerItem, flatAmount } = getStoreShipping(storeItems, storeShippingOverrides);
            const itemsTotal = storeItems.reduce((s, i) => s + i.priceAud, 0);
            const perItemPostage = isPerItem
              ? storeItems.reduce((s, i) => s + (i.shippingAud ?? 0), 0)
              : 0;
            const storeTotal = itemsTotal + (isPerItem ? perItemPostage : (flatAmount ?? 0));

            const collapsed = collapsedStores.has(storeName);
            return (
              <div key={storeName} className="rounded-lg border border-subtle bg-surface">
                {/* Store header */}
                <button
                  onClick={() => toggleStore(storeName)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-cream-muted border-b border-subtle hover:bg-muted transition-colors rounded-t-lg"
                >
                  <span className="font-semibold text-cream text-sm">{storeName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-cream-dim/50 text-xs">
                      {storeItems.length} item{storeItems.length !== 1 ? "s" : ""}
                      {collapsed && <span className="ml-2 text-price font-semibold">{fmtAUD(storeTotal)}</span>}
                    </span>
                    <span className="text-cream-dim/30 text-xs">{collapsed ? "▶" : "▼"}</span>
                  </div>
                </button>

                {!collapsed && <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs border-b border-subtle">
                      <th className="px-3 py-1.5 text-left font-medium text-cream-dim">Card</th>
                      <th className="px-2 py-1.5 text-left font-medium text-cream-dim">Printing</th>
                      {isPerItem && (
                        <th className="px-2 py-1.5 text-right font-medium text-cream-dim">Postage</th>
                      )}
                      <th className="px-2 py-1.5 text-right font-medium text-cream-dim">Price</th>
                      <th className="px-2 py-1.5" />
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {storeItems.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-subtle/60 last:border-0 hover:bg-muted transition-colors"
                      >
                        {/* Card name */}
                        <td className="px-3 py-1.5">
                          <a
                            href={cardHref(item.cardSlug, item.cardId)}
                            className="font-medium text-cream hover:text-accent transition-colors"
                            onMouseEnter={item.imageUri ? (e) => showCardPreview(item.imageUri!, e) : undefined}
                            onMouseLeave={() => setCardPreview(null)}
                          >
                            {item.cardName}
                          </a>
                        </td>

                        {/* Printing selector */}
                        <td className="px-2 py-1.5">
                          <PrintingSelector
                            item={item}
                            onSelect={(p) => handlePrintingChange(item, p)}
                          />
                        </td>

                        {/* Per-item postage (eBay only) */}
                        {isPerItem && (
                          <td className="px-2 py-1.5 text-right text-xs text-cream-dim/50 whitespace-nowrap">
                            {item.shippingAud === null
                              ? "—"
                              : item.shippingAud === 0
                              ? "free"
                              : fmtAUD(item.shippingAud)}
                          </td>
                        )}

                        {/* Price */}
                        <td className="px-2 py-1.5 text-right text-price font-semibold whitespace-nowrap">
                          {fmtAUD(item.priceAud)}
                        </td>

                        {/* Buy link */}
                        <td className="px-2 py-1.5 text-right">
                          {item.url && (
                            <BuyLink
                              href={item.url}
                              storeId={item.storeId}
                              card={item.cardName}
                              price={item.priceAud}
                              source="want-list"
                              className="text-xs text-price hover:text-cream transition-colors"
                            />
                          )}
                        </td>

                        {/* Remove */}
                        <td className="pr-2 py-1.5 text-right">
                          <button
                            onClick={() => removeItem(item.id)}
                            title="Remove"
                            className="w-5 h-5 rounded flex items-center justify-center text-cream-dim/30 hover:text-red-400 hover:bg-red-900/20 transition-colors ml-auto"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>}

                {!collapsed && <div className="flex justify-end px-3 py-2 pr-[72px] border-t border-subtle bg-cream-muted/50 rounded-b-lg">
                  <div className="flex flex-col items-end gap-0.5">
                    {!isPerItem && (
                      <EditablePostageRow
                        amount={flatAmount}
                        isOverride={storeItems[0]?.storeId in storeShippingOverrides}
                        onSave={(amt) => setStoreShipping(storeItems[0]?.storeId, amt)}
                      />
                    )}
                    {isPerItem && perItemPostage > 0 && (
                      <span className="text-xs text-cream-dim/50">Postage: {fmtAUD(perItemPostage)}</span>
                    )}
                    <div className="text-sm">
                      <span className="text-cream-dim/50 mr-2 text-xs">Store total</span>
                      <span className="text-price font-bold">{fmtAUD(storeTotal)}</span>
                      {!isPerItem && flatAmount === null && (
                        <span className="text-[10px] text-cream-dim/30 ml-1">+ postage</span>
                      )}
                    </div>
                  </div>
                </div>}
              </div>
            );
          })}

          {/* Grand total */}
          <div className="flex justify-end">
            <div className="rounded-lg border border-subtle bg-surface px-5 py-3 text-sm min-w-[200px]">
              <div className="flex items-center justify-between gap-6">
                <span className="text-cream-dim/60">Grand total</span>
                <span className="text-price font-bold text-base">{fmtAUD(grandTotal)} AUD</span>
              </div>
              {grandPostage > 0 && (
                <div className="text-right mt-0.5 text-[10px] text-cream-dim/40">
                  incl. ~{fmtAUD(grandPostage)} estimated postage
                </div>
              )}
              {hasUnknownPostage && (
                <div className="text-right mt-0.5 text-[10px] text-cream-dim/30">
                  + postage for some stores
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Card image preview on name hover */}
      {cardPreview && (
        <CardImagePopup uri={cardPreview.uri} top={cardPreview.top} left={cardPreview.left} width={244} />
      )}

      {/* Optimise modal */}
      {optimiseOpen && (
        <OptimiseModal
          result={optimiseResult}
          loading={optimiseLoading}
          currentItems={items}
          currentPostage={grandPostage}
          lockedPrintingIds={lockedPrintingIds}
          checkedCardIds={checkedCardIds}
          unchangedExpanded={unchangedExpanded}
          onToggleLock={handleToggleLock}
          onToggleChecked={handleToggleChecked}
          onToggleAll={handleToggleAll}
          onReoptimise={handleReoptimise}
          onApply={applyOptimisedPlan}
          onDismiss={() => setOptimiseOpen(false)}
          onToggleUnchanged={() => setUnchangedExpanded((v) => !v)}
        />
      )}

      {/* Import section */}
      <ImportCards />
    </div>
  );
}
