"use client";

import React, { useState, useEffect } from "react";
import { useWantList, toWantListItem, type WantListItem } from "@/app/WantListContext";
import { fmtAUD } from "@/lib/utils";
import { SetSymbol } from "@/app/SetSymbol";
import { BuyLink } from "@/app/BuyLink";
import { computePopupPos, CardImagePopup } from "@/app/CardMagnifier";
import { ImportCards } from "./ImportCards";
import type { OptimizeResult } from "@/app/api/optimize/route";
import { cardHref } from "@/lib/utils";
import { variantBadgeWithFoil } from "@/lib/variant-utils";
import { PrintingSelector, type StorePrinting } from "./PrintingSelector";
import { OptimiseModal } from "./OptimiseModal";

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
 *  then DB value, then the store's registered flat rate. */
function getStoreShipping(
  items: WantListItem[],
  overrides: Record<string, number>,
  storeShippingAud: Record<string, number | null>
): { isPerItem: boolean; flatAmount: number | null } {
  const storeId = items[0]?.storeId ?? "";
  if (storeId === "ebay_au") {
    return { isPerItem: true, flatAmount: null };
  }
  if (storeId in overrides) {
    return { isPerItem: false, flatAmount: overrides[storeId] };
  }
  const fromDb = items.find((i) => i.shippingAud !== null)?.shippingAud;
  const flatAmount = fromDb !== undefined ? fromDb : (storeShippingAud[storeId] ?? null);
  return { isPerItem: false, flatAmount };
}

// ── Main component ────────────────────────────────────────────────────────────

export function WantListView({ storeShippingAud }: { storeShippingAud: Record<string, number | null> }) {
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
    const { isPerItem, flatAmount } = getStoreShipping(storeItems, storeShippingOverrides, storeShippingAud);
    if (isPerItem) {
      grandPostage += storeItems.reduce((s, i) => s + (i.shippingAud ?? 0), 0);
    } else {
      grandPostage += flatAmount ?? 0;
    }
  }
  const grandTotal = grandCards + grandPostage;
  const hasUnknownPostage = Array.from(byStore.values()).some((storeItems) => {
    const shipping = getStoreShipping(storeItems, storeShippingOverrides, storeShippingAud);
    return !shipping.isPerItem && shipping.flatAmount === null;
  });

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
            const { isPerItem, flatAmount } = getStoreShipping(storeItems, storeShippingOverrides, storeShippingAud);
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
