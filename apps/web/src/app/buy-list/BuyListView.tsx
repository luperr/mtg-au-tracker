"use client";

import { useState, useRef, useEffect, type SyntheticEvent } from "react";
import { useBuyList, type BuyListItem } from "@/app/BuyListContext";
import { fmtAUD } from "@/lib/format";
import { RARITY_FILTER, RARITY_FALLBACK_COLOR } from "@/lib/rarity";
import { STORE_FLAT_SHIPPING_AUD } from "@/lib/store-shipping";
import { ImportCards } from "./ImportCards";
import type { OptimizeResult, OptimizeAssignment } from "@/app/api/optimize/route";

// ── Set symbol (local copy — same as PricesTable) ─────────────────────────────

function SetSymbol({ setCode, setName, rarity }: { setCode: string; setName: string; rarity: string }) {
  const [failed, setFailed] = useState(false);
  const color = RARITY_FALLBACK_COLOR[rarity] ?? RARITY_FALLBACK_COLOR.common;

  function onError(e: SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.style.display = "none";
    setFailed(true);
  }

  if (failed) {
    return (
      <span style={{ color, fontSize: 14, width: 18, textAlign: "center", display: "inline-block" }} title={setName}>
        ❖
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://svgs.scryfall.io/sets/${setCode}.svg`}
      alt={setName}
      width={18}
      height={18}
      className="shrink-0"
      style={{ filter: RARITY_FILTER[rarity] ?? RARITY_FILTER.common }}
      loading="lazy"
      onError={onError}
    />
  );
}

// ── Printing selector ─────────────────────────────────────────────────────────

type StorePrinting = {
  id: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  isFoil: boolean;
  imageUri: string | null;
  priceAud: number;
  shippingAud: number | null;
  condition: string | null;
  url: string | null;
};

function PrintingSelector({
  item,
  onSelect,
}: {
  item: BuyListItem;
  onSelect: (p: StorePrinting) => void;
}) {
  const [open, setOpen] = useState(false);
  const [printings, setPrintings] = useState<StorePrinting[] | null>(null);
  const loadedRef = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    if (!item.storeId) {
      setPrintings([]);
      return;
    }
    fetch(`/api/cards/store-printings?cardId=${item.cardId}&storeId=${item.storeId}`)
      .then((r) => r.json())
      .then(setPrintings)
      .catch(() => setPrintings([]));
  }, [open, item.cardId, item.storeId]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        title={`${item.setName}${item.isFoil ? " (Foil)" : ""} — click to change printing`}
        className="flex items-center gap-0.5 hover:opacity-70 transition-opacity"
      >
        <SetSymbol setCode={item.setCode} setName={item.setName} rarity={item.rarity} />
        <span className="text-[8px] text-cream-dim/30">▼</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 min-w-[240px] rounded-lg border border-subtle bg-surface shadow-xl shadow-black/50">
          {printings === null ? (
            <div className="px-3 py-3 text-xs text-cream-dim/50">Loading…</div>
          ) : printings.length === 0 ? (
            <div className="px-3 py-3 text-xs text-cream-dim/50">No in-stock printings at this store</div>
          ) : (
            <div className="py-1 max-h-56 overflow-y-auto">
              {printings.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p); setOpen(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted ${
                    p.id === item.printingId ? "text-cream" : "text-cream-dim"
                  }`}
                >
                  <SetSymbol setCode={p.setCode} setName={p.setName} rarity={p.rarity} />
                  <span className="flex-1 truncate">
                    {p.setName} #{p.collectorNumber}{p.isFoil ? " ✦" : ""}
                  </span>
                  <span className="text-price font-semibold whitespace-nowrap">{fmtAUD(p.priceAud)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Postage tooltip ───────────────────────────────────────────────────────────

function PostageRow({ amount }: { amount: number | null }) {
  if (amount === null) return null;
  return (
    <div className="relative group flex items-center gap-1 text-xs text-cream-dim/50">
      <span>Postage: {amount === 0 ? "free" : fmtAUD(amount)}</span>
      <span className="cursor-help text-[10px] text-cream-dim/30">ⓘ</span>
      <div className="absolute bottom-full left-0 mb-2 w-60 rounded-md bg-surface border border-subtle px-2.5 py-2 text-[10px] text-cream-dim/60 shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-20 leading-relaxed">
        Estimated. Postage is charged once per order and the actual amount may vary at checkout.
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByStore(items: BuyListItem[]): Map<string, BuyListItem[]> {
  const map = new Map<string, BuyListItem[]>();
  for (const item of items) {
    const group = map.get(item.storeName) ?? [];
    group.push(item);
    map.set(item.storeName, group);
  }
  return map;
}

/** Returns the shipping charge for a store group.
 *  eBay items are per-seller so each row has its own shippingAud → sum them.
 *  Other stores charge flat rate per order → take from first item or static config. */
function getStoreShipping(items: BuyListItem[]): { isPerItem: boolean; flatAmount: number | null } {
  const storeId = items[0]?.storeId ?? "";
  if (storeId === "ebay_au") {
    return { isPerItem: true, flatAmount: null };
  }
  const fromDb = items.find((i) => i.shippingAud !== null)?.shippingAud;
  const flatAmount = fromDb !== undefined ? fromDb : (STORE_FLAT_SHIPPING_AUD[storeId] ?? null);
  return { isPerItem: false, flatAmount };
}

// ── Optimise result panel ─────────────────────────────────────────────────────

function OptimisePanel({
  result,
  currentCost,
  currentItems,
  onApply,
  onDismiss,
}: {
  result: OptimizeResult;
  currentCost: number;
  currentItems: BuyListItem[];
  onApply: (assignments: OptimizeAssignment[]) => void;
  onDismiss: () => void;
}) {
  const savings = currentCost - result.totalCost;
  const hasSavings = savings > 0.005;

  // Map printingId → current store for change detection
  const currentStoreByPrinting = new Map(currentItems.map((i) => [i.printingId, i.storeName]));

  // Group assignments by store for display
  const byStore = new Map<string, OptimizeAssignment[]>();
  for (const a of result.assignments) {
    if (!byStore.has(a.storeName)) byStore.set(a.storeName, []);
    byStore.get(a.storeName)!.push(a);
  }

  return (
    <div className="rounded-lg border border-accent-border bg-surface overflow-hidden mb-6">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 bg-accent-muted/30 border-b border-accent-border gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-cream text-sm">Optimised plan</span>
            {hasSavings ? (
              <span className="text-xs text-green-400 font-bold bg-green-900/20 px-2 py-0.5 rounded-full">
                save {fmtAUD(savings)}
              </span>
            ) : (
              <span className="text-xs text-cream-dim/40">already optimal</span>
            )}
          </div>
          <div className="text-xs text-cream-dim/50">
            Current: <span className="text-cream-dim">{fmtAUD(currentCost)}</span>
            <span className="mx-1.5 text-cream-dim/30">→</span>
            Optimised: <span className="text-price font-semibold">{fmtAUD(result.totalCost)}</span>
            {result.totalPostage > 0 && (
              <span className="ml-1 text-cream-dim/40">(incl. ~{fmtAUD(result.totalPostage)} postage)</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {hasSavings && (
            <button
              onClick={() => onApply(result.assignments)}
              className="rounded-lg bg-price text-bg px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Apply plan
            </button>
          )}
          <button
            onClick={onDismiss}
            className="text-xs text-cream-dim/40 hover:text-cream-dim transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Per-store card breakdown */}
      <div className="divide-y divide-subtle">
        {result.storeBreakdown.map((store) => {
          const storeAssignments = byStore.get(store.storeName) ?? [];
          return (
            <div key={store.storeId} className="px-4 py-3">
              {/* Store header row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-cream text-sm">{store.storeName}</span>
                  {store.shipping !== null && (
                    <span className="text-[10px] text-cream-dim/40 bg-muted px-1.5 py-0.5 rounded">
                      {store.shipping === 0 ? "free post" : `${fmtAUD(store.shipping)} post`}
                    </span>
                  )}
                </div>
                <span className="text-price font-bold text-sm">{fmtAUD(store.storeTotal)}</span>
              </div>
              {/* Cards in this store */}
              <div className="space-y-1">
                {storeAssignments.map((a) => {
                  const prevStore = currentStoreByPrinting.get(a.printingId);
                  const moved = prevStore && prevStore !== a.storeName;
                  return (
                    <div key={a.printingId} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {moved && (
                          <span className="text-green-400/70 shrink-0" title={`Was: ${prevStore}`}>↻</span>
                        )}
                        <span className={`truncate ${moved ? "text-cream" : "text-cream-dim/70"}`}>
                          {a.cardName}
                        </span>
                        {moved && (
                          <span className="text-cream-dim/30 shrink-0 text-[10px]">was {prevStore}</span>
                        )}
                      </div>
                      <span className="text-price/80 font-medium ml-2 shrink-0">{fmtAUD(a.priceAud)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-subtle bg-cream-muted/30 flex items-center justify-between gap-4">
        <p className="text-[10px] text-cream-dim/30 leading-relaxed">
          Tries all combinations of flat-rate stores (Good Games, MTG Mate) and assigns each card to its cheapest option, paying postage once per store order. eBay listings are per-seller.
        </p>
        {result.unavailable.length > 0 && (
          <p className="text-[10px] text-amber-400/60 shrink-0">
            Not found: {result.unavailable.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BuyListView() {
  const { items, removeItem, addItem, clearAll, totalCount } = useBuyList();
  const byStore = groupByStore(items);
  const [optimising, setOptimising] = useState(false);
  const [optimiseResult, setOptimiseResult] = useState<OptimizeResult | null>(null);
  const [optimiseError, setOptimiseError] = useState<string | null>(null);
  const optimisePanelRef = useRef<HTMLDivElement>(null);

  async function handleOptimise() {
    setOptimising(true);
    setOptimiseResult(null);
    setOptimiseError(null);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            cardId: i.cardId,
            cardName: i.cardName,
            printingId: i.printingId,
          })),
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as OptimizeResult;
      setOptimiseResult(data);
      setTimeout(() => {
        optimisePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (err) {
      setOptimiseError(err instanceof Error ? err.message : "Optimisation failed");
    } finally {
      setOptimising(false);
    }
  }

  function applyOptimisedPlan(assignments: OptimizeAssignment[]) {
    // Replace each item in the buy list with its optimised assignment
    for (const a of assignments) {
      // Find the current item for this printing
      const current = items.find((i) => i.printingId === a.printingId);
      if (!current) continue;
      if (current.storeId === a.storeId && current.priceAud === a.priceAud) continue; // no change
      removeItem(current.id);
      addItem({
        ...current,
        id: `${a.printingId}-${a.storeName}`,
        storeId: a.storeId,
        storeName: a.storeName,
        priceAud: a.priceAud,
        shippingAud: a.shippingAud,
        condition: a.condition,
        url: a.url,
        setName: a.setName,
        setCode: a.setCode,
        rarity: a.rarity,
        isFoil: a.isFoil,
        imageUri: a.imageUri,
      });
    }
    setOptimiseResult(null);
  }

  // Compute totals
  let grandCards = 0;
  let grandPostage = 0;
  for (const storeItems of byStore.values()) {
    grandCards += storeItems.reduce((s, i) => s + i.priceAud, 0);
    const { isPerItem, flatAmount } = getStoreShipping(storeItems);
    if (isPerItem) {
      grandPostage += storeItems.reduce((s, i) => s + (i.shippingAud ?? 0), 0);
    } else {
      grandPostage += flatAmount ?? 0;
    }
  }
  const grandTotal = grandCards + grandPostage;
  const hasUnknownPostage = Array.from(byStore.values()).some(
    (storeItems) => !getStoreShipping(storeItems).isPerItem && getStoreShipping(storeItems).flatAmount === null
  );

  function handlePrintingChange(item: BuyListItem, p: StorePrinting) {
    removeItem(item.id);
    addItem({
      ...item,
      id: `${p.id}-${item.storeName}`,
      printingId: p.id,
      setName: p.setName,
      setCode: p.setCode,
      rarity: p.rarity,
      isFoil: p.isFoil,
      priceAud: p.priceAud,
      shippingAud: p.shippingAud,
      condition: p.condition,
      url: p.url,
      imageUri: p.imageUri,
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cream">Buy List</h1>
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
            <button
              onClick={handleOptimise}
              disabled={optimising}
              className="rounded-lg border border-accent-border bg-accent-muted/40 px-3 py-1.5 text-xs font-semibold text-accent-light hover:bg-accent-muted transition-colors disabled:opacity-50"
            >
              {optimising ? "Optimising…" : "✦ Optimise"}
            </button>
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
          <p className="text-cream-dim/50 mb-2">Your buy list is empty.</p>
          <p className="text-xs text-cream-dim/30">
            Browse cards and click <span className="text-price">+</span> on any price row to add it here.
          </p>
        </div>
      ) : (
        <div className="space-y-6 mb-8">
          {Array.from(byStore.entries()).map(([storeName, storeItems]) => {
            const { isPerItem, flatAmount } = getStoreShipping(storeItems);
            const itemsTotal = storeItems.reduce((s, i) => s + i.priceAud, 0);
            const perItemPostage = isPerItem
              ? storeItems.reduce((s, i) => s + (i.shippingAud ?? 0), 0)
              : 0;
            const storeTotal = itemsTotal + (isPerItem ? perItemPostage : (flatAmount ?? 0));

            return (
              <div key={storeName} className="rounded-lg border border-subtle bg-surface overflow-hidden">
                {/* Store header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-cream-muted border-b border-subtle">
                  <span className="font-semibold text-cream text-sm">{storeName}</span>
                  <span className="text-cream-dim/50 text-xs">
                    {storeItems.length} item{storeItems.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Items table */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs border-b border-subtle">
                      <th className="px-4 py-2 text-left font-medium text-cream-dim">Card</th>
                      <th className="px-2 py-2 text-left font-medium text-cream-dim">Printing</th>
                      <th className="px-3 py-2 text-right font-medium text-cream-dim">Price</th>
                      {isPerItem && (
                        <th className="px-3 py-2 text-right font-medium text-cream-dim">Postage</th>
                      )}
                      <th className="px-2 py-2" />
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {storeItems.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-subtle/60 last:border-0 hover:bg-muted transition-colors"
                      >
                        {/* Card name */}
                        <td className="px-4 py-2.5">
                          <a
                            href={`/cards/${item.cardId}`}
                            className="font-medium text-cream hover:text-accent transition-colors"
                          >
                            {item.cardName}
                          </a>
                          {item.condition && (
                            <div className="text-[10px] text-cream-dim/40 mt-0.5">{item.condition}</div>
                          )}
                        </td>

                        {/* Printing selector */}
                        <td className="px-2 py-2.5">
                          <PrintingSelector
                            item={item}
                            onSelect={(p) => handlePrintingChange(item, p)}
                          />
                        </td>

                        {/* Price */}
                        <td className="px-3 py-2.5 text-right text-price font-semibold whitespace-nowrap">
                          {fmtAUD(item.priceAud)}
                        </td>

                        {/* Per-item postage (eBay only) */}
                        {isPerItem && (
                          <td className="px-3 py-2.5 text-right text-xs text-cream-dim/50 whitespace-nowrap">
                            {item.shippingAud === null
                              ? "—"
                              : item.shippingAud === 0
                              ? "free"
                              : fmtAUD(item.shippingAud)}
                          </td>
                        )}

                        {/* Buy link */}
                        <td className="px-2 py-2.5 text-right">
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-price hover:text-cream transition-colors"
                            >
                              Buy ↗
                            </a>
                          )}
                        </td>

                        {/* Remove */}
                        <td className="pr-3 py-2.5 text-right">
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
                </table>

                {/* Store footer: postage + total */}
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-subtle bg-cream-muted/50">
                  <div>
                    {!isPerItem && <PostageRow amount={flatAmount} />}
                  </div>
                  <div className="text-sm text-right">
                    <span className="text-cream-dim/50 mr-2 text-xs">Store total</span>
                    <span className="text-price font-bold">{fmtAUD(storeTotal)}</span>
                    {!isPerItem && flatAmount === null && (
                      <span className="text-[10px] text-cream-dim/30 ml-1">+ postage</span>
                    )}
                  </div>
                </div>
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

      {/* Optimise result */}
      {optimiseError && (
        <p className="text-sm text-red-400 mb-4">{optimiseError}</p>
      )}
      {optimiseResult && (
        <div ref={optimisePanelRef}>
          <OptimisePanel
            result={optimiseResult}
            currentCost={grandTotal}
            currentItems={items}
            onApply={applyOptimisedPlan}
            onDismiss={() => setOptimiseResult(null)}
          />
        </div>
      )}

      {/* Import section */}
      <ImportCards />
    </div>
  );
}
