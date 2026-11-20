"use client";

import React, { useEffect, useRef, useState } from "react";
import { useWantList, type WantListItem } from "@/app/WantListContext";
import { AffiliateDisclosure } from "@/app/AffiliateDisclosure";
import { pillClass } from "@/app/Dropdown";
import { EBAY_STORE_ID } from "@/lib/affiliate";
import { cardHref, fmtCents, plural } from "@/lib/utils";
import { track } from "@/lib/analytics";
import {
  applyPlan, listStores, listTotals, parseSavedPrefs, requestPrefs, toLines, totalQty, withPlan, PREFS_KEY,
  type PlannedFlags, type SavedPrefs, type StoreGroup,
} from "@/lib/optimiser/want-list";
import { toCents, type OptimiseResponse, type Unavailable } from "@/lib/optimiser/types";
import type { StoreSummary } from "@/lib/store-shipping";
import { ImportCards, type ImportSummary } from "./ImportCards";
import { PrefsBar, PrefsSheet, activePrefCount } from "./PrefsBar";
import { StoreSection } from "./StoreSection";
import { CardPreviewProvider } from "./CardPreview";
import { useOptimiser } from "./useOptimiser";

const UNAVAILABLE_REASON: Record<Unavailable["reason"], string> = {
  "no-listings": "not in stock anywhere",
  "no-match": "none in stock that match your preferences",
  // Also what a store cap or unticked stores produce, so it names the stores, not stock.
  short: "not enough copies at the stores this plan can use",
};

/**
 * The last optimise: its answer, what it changed, the list before it (for Undo),
 * and the list, prefs and postage it produced — compared by reference, since
 * every edit makes a new one.
 */
type Optimised = {
  data: OptimiseResponse;
  planned: Map<string, PlannedFlags>;
  before: WantListItem[];
  after: WantListItem[];
  prefs: SavedPrefs;
  overrides: Record<string, number>;
};

/**
 * The want list, grouped by the store each card is bought from. Optimise asks the
 * optimiser for the cheapest plan under the preferences and moves every card to
 * its planned listing in one go, with Undo. Until then — or once the list or
 * preferences change — totals are an estimate from each store's flat postage.
 */
export function WantListView({ stores, rates }: { stores: StoreSummary[]; rates: Record<string, number | null> }) {
  const { items, clearAll, replaceItems, storeShippingOverrides } = useWantList();
  const [prefs, setPrefs] = useState<SavedPrefs>(() => parseSavedPrefs(null));
  const [optimised, setOptimised] = useState<Optimised | null>(null);
  const [imported, setImported] = useState<ImportSummary | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  // Set when a run's answer was dropped because the list changed while it ran.
  const [changedDuringRun, setChangedDuringRun] = useState(false);
  // The list as it is now, for a run to compare against when its answer arrives.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  // Bumped per run; an answer from anything but the latest run is dropped.
  const runRef = useRef(0);
  const optimiser = useOptimiser();

  useEffect(() => {
    try {
      setPrefs(parseSavedPrefs(localStorage.getItem(PREFS_KEY)));
    } catch {
      // storage blocked: defaults stand
    }
  }, []);

  function changePrefs(patch: Partial<SavedPrefs>, pref: string): SavedPrefs {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    track("optimise-pref", { pref });
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // not persisted; still applies this visit
    }
    return next;
  }

  // The plan still describes the list only while neither the list, the prefs nor the postage have moved.
  const fresh = optimised !== null && optimised.after === items && optimised.prefs === prefs
    && optimised.overrides === storeShippingOverrides;

  async function optimise(withPrefs: SavedPrefs = prefs) {
    const run = ++runRef.current;
    const sent = items;
    // Undo goes back to the list from before the first run: a later run with only prefs or
    // postage changed (a chip, "Don't use this store", a new condition) keeps that original.
    const before = optimised !== null && optimised.after === items ? optimised.before : items;
    setChangedDuringRun(false);
    const data = await optimiser.run({ lines: toLines(sent), prefs: requestPrefs(withPrefs, storeShippingOverrides) });
    if (!data || run !== runRef.current) return; // failed, or a newer run has taken over
    // The plan was for the list as sent. If it changed while the request ran, applying the
    // plan would silently throw those edits away — keep them, and ask for another run.
    if (itemsRef.current !== sent) {
      setChangedDuringRun(true);
      return;
    }
    const { items: after, flags: planned } = applyPlan(sent, data);
    replaceItems(after);
    setOptimised({ data, planned, before, after, prefs: withPrefs, overrides: storeShippingOverrides });
  }

  function undo() {
    if (!optimised) return;
    replaceItems(optimised.before);
    setOptimised(null);
    track("optimise-undo", {});
  }

  function handleExclude(store: StoreGroup) {
    track("optimise-exclude-store", { store: store.storeId });
    optimise(changePrefs({ excludeStores: [...prefs.excludeStores, store.storeId] }, "stores"));
  }

  function handleMaxStores(n: number | null) {
    track("optimise-alt", { stores: n });
    optimise(changePrefs({ maxStores: n }, "max-stores"));
  }

  // A store's flat postage, the user's override first; null (no rate) means per item, as the optimiser reads it.
  const flatCents = (storeId: string) => {
    if (rates[storeId] == null) return null;
    return toCents(storeShippingOverrides[storeId] ?? rates[storeId]!);
  };
  // The last optimise, only while it still describes the list.
  const current = fresh ? optimised : null;
  const plan = current?.data ?? null;
  // The plan's exact postage where it's current; the header sums the same groups the page lists.
  const storeList = withPlan(listStores(items, flatCents), plan);
  const totals = listTotals(storeList);

  const unavailable = plan?.unavailable ?? [];
  const copies = totalQty(items);
  const locked = items.filter((i) => i.printingMode === "exact").length;

  function unlockAll() {
    replaceItems(items.map((i) => (i.printingMode === "exact" ? { ...i, printingMode: "any" } : i)));
    track("optimise-unlock-all", { cards: locked });
  }

  const summary = (
    <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xl font-bold text-price">
                      {totals.estimated ? "~" : ""}{fmtCents(totals.totalCents)}
                    </span>
                    <span className="text-sm text-cream-dim">
                      {plural(totals.storeCount, "store")} · postage {fmtCents(totals.postageCents)}
                    </span>
                  </div>
                  <p className="text-xs text-cream-dim">
                    {plan ? (
                      <>
                        {plan.savingsCents !== null && plan.savingsCents > 0
                          ? <span className="text-green-400">Optimised — saved {fmtCents(plan.savingsCents)}. </span>
                          : <span>Optimised — {plan.savingsCents === 0 ? "already the cheapest. " : "done. "}</span>}
                        <button onClick={undo} className="text-accent-light hover:underline">Undo</button>
                      </>
                    ) : changedDuringRun ? (
                      "Your list changed while optimising, so nothing was moved — optimise again."
                    ) : optimised ? (
                      "List or preferences changed — optimise again for the cheapest plan."
                    ) : (
                      "Estimated. Optimise to find the cheapest stores for your preferences."
                    )}
                  </p>
                </div>
                <button
                  onClick={() => optimise()}
                  disabled={optimiser.loading || fresh}
                  className="shrink-0 rounded-lg bg-cta px-4 py-3 sm:py-2 text-sm font-semibold text-white hover:bg-price disabled:opacity-60 disabled:hover:bg-cta transition-colors"
                >
                  {optimiser.loading ? "Optimising…" : fresh ? "Optimised ✓" : "✦ Optimise"}
                </button>
              </div>

              {optimiser.error && (
                <div role="alert" className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-red-400">{optimiser.error}</span>
                  <button onClick={() => optimise()} className="text-accent-light hover:underline">Try again</button>
                </div>
              )}

              {plan && (plan.alternatives.length > 0 || prefs.maxStores !== null) && (
                <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Number of stores">
                  {[...plan.alternatives.map((a) => ({ n: a.storeCount, total: a.totalCents, active: false })),
                    { n: plan.plan.totals.storeCount, total: plan.plan.totals.totalCents, active: true }].map((c) => (
                    <button
                      key={c.n}
                      onClick={() => !c.active && handleMaxStores(c.n)}
                      disabled={optimiser.loading}
                      aria-pressed={c.active}
                      className={`${pillClass(c.active)} !py-1`}
                    >
                      {plural(c.n, "store")} · {fmtCents(c.total)}
                    </button>
                  ))}
                  {prefs.maxStores !== null && (
                    <button onClick={() => handleMaxStores(null)} disabled={optimiser.loading} className={`${pillClass(false)} !py-1`}>
                      All stores
                    </button>
                  )}
                </div>
              )}
    </>
  );

  const listActions = (
    <>
      {locked > 0 && (
        <button onClick={unlockAll} className="whitespace-nowrap py-2 sm:py-0 text-xs text-cream-dim hover:text-cream transition-colors">
          Unlock all ({locked})
        </button>
      )}
      <button onClick={() => { track("want-list-edit", { action: "clear", source: "want-list", items: items.length }); clearAll(); setOptimised(null); }} className="whitespace-nowrap py-2 sm:py-0 text-xs text-cream-dim hover:text-red-400 transition-colors">
        Clear all
      </button>
    </>
  );

  return (
    <CardPreviewProvider>
      <div className="mx-auto max-w-3xl">
        <div className="mb-3">
          <h1 className="text-2xl font-bold text-cream">Want List</h1>
          {items.length > 0 && (
            <p className="mt-0.5 text-sm text-cream-dim">{plural(items.length, "card")} · {plural(copies, "copy", "copies")}</p>
          )}
        </div>

        {items.length === 0 ? (
          <div className="mb-6 rounded-lg border border-subtle bg-surface px-6 py-10 text-center">
            <p className="mb-1 text-cream">Your want list is empty.</p>
            <p className="text-sm text-cream-dim">Paste a deck list below, or click <span className="text-price">+</span> on any card.</p>
          </div>
        ) : (
          <>
            {/* sm+: the summary sticks to the top. Phones get it as a bar at the bottom instead, below. */}
            <div className="hidden sm:block sticky top-0 z-20 -mx-4 mb-3 border-b border-subtle bg-bg/95 px-4 py-2.5 backdrop-blur" aria-live="polite">
              {summary}
            </div>

            {/* sm+: the preferences as pills. Phones: one Filters button opening them in a drawer, as search does. */}
            <div className="mb-4 hidden sm:block">
              <PrefsBar prefs={prefs} stores={stores} onChange={changePrefs}>{listActions}</PrefsBar>
            </div>
            <div className="mb-3 flex items-center gap-4 sm:hidden">
              <button onClick={() => setPrefsOpen(true)} className={`${pillClass(activePrefCount(prefs) > 0, "rounded-lg")} min-h-10`}>
                Filters{activePrefCount(prefs) > 0 && ` (${activePrefCount(prefs)})`}
              </button>
              <div className="ml-auto flex items-center gap-4">{listActions}</div>
            </div>
            <PrefsSheet open={prefsOpen} onClose={() => setPrefsOpen(false)} prefs={prefs} stores={stores} onChange={changePrefs} />

            {imported && (
              <div role="status" className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-accent-border bg-surface px-3 py-2.5 text-sm">
                <p className="text-cream-dim">
                  <span className="text-cream">Added {plural(imported.added, "card")} ({plural(imported.copies, "copy", "copies")}).</span>
                  {imported.alreadyListed > 0 && ` ${imported.alreadyListed} already on your list.`}
                  {imported.notFound.length > 0 && ` Not found: ${imported.notFound.join(", ")}.`}
                  {" "}Press Optimise for the cheapest stores.
                </p>
                <button onClick={() => setImported(null)} aria-label="Dismiss" className="shrink-0 text-cream-dim hover:text-cream">×</button>
              </div>
            )}

            {unavailable.length > 0 && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-surface px-3 py-2.5 text-sm">
                <p className="font-semibold text-cream">Couldn’t find a better listing for</p>
                <ul className="text-cream-dim">
                  {unavailable.map((u) => (
                    <li key={u.lineId}>
                      <a href={cardHref(items.find((i) => i.id === u.lineId)?.cardSlug, u.cardId)} className="text-cream hover:text-accent">{u.cardName}</a>
                      {" "}— {u.reason === "short" ? `${u.missing} short, ` : ""}{UNAVAILABLE_REASON[u.reason]}; left as it was
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-8 space-y-3">
              {storeList.map((store) => (
                <React.Fragment key={store.storeId}>
                  {/* EPN / ACL: disclosure must directly precede the affiliate links */}
                  {store.storeId === EBAY_STORE_ID && <AffiliateDisclosure className="!mb-2 px-1" />}
                  <StoreSection
                    store={store}
                    planned={current?.planned ?? null}
                    onExclude={() => handleExclude(store)}
                  />
                </React.Fragment>
              ))}
            </div>

            {/* Phones: total and Optimise in thumb reach. Sticky rather than fixed, so it settles above the import panel. */}
            <div className="sm:hidden sticky bottom-0 z-20 -mx-4 mb-6 border-t border-subtle bg-bg/95 px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur" aria-live="polite">
              {summary}
            </div>
          </>
        )}

        <ImportCards onImported={(summary) => { setImported(summary); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </div>
    </CardPreviewProvider>
  );
}
