"use client";

import type { WantListItem } from "@/app/WantListContext";
import { fmtAUD } from "@/lib/utils";
import { SetSymbol } from "@/app/SetSymbol";
import type { OptimizeResult } from "@/app/api/optimize/route";
import { variantBadgeWithFoil } from "@/lib/variant-utils";

export function OptimiseModal({
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
