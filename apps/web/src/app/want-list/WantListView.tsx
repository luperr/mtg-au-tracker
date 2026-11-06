"use client";

import React, { useEffect, useState } from "react";
import { useWantList, wantListItemId, type WantListItem } from "@/app/WantListContext";
import { AffiliateDisclosure } from "@/app/AffiliateDisclosure";
import { cardHref, fmtAUD, trackEvent } from "@/lib/utils";
import {
  applyPlan, itemQty, listStores, parseSavedPrefs, requestPrefs, toLines, PREFS_KEY, type SavedPrefs,
} from "@/lib/optimiser/want-list";
import type { OptimiseResponse, PlanStore, Unavailable } from "@/lib/optimiser/types";
import type { StoreSummary } from "@/lib/store-shipping";
import { ImportCards } from "./ImportCards";
import { PrefsBar } from "./PrefsBar";
import { StoreSection, type RowFlags } from "./StoreSection";
import { CardPreviewProvider } from "./CardPreview";
import { useOptimiser } from "./useOptimiser";

const cents = (c: number) => fmtAUD(c / 100);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const UNAVAILABLE_REASON: Record<Unavailable["reason"], string> = {
  "no-listings": "not in stock anywhere",
  "no-match": "none in stock that match your preferences",
  short: "not enough copies in stock",
};

/** The last optimise: its answer, the list before it (for Undo) and the list it produced. */
type Optimised = { data: OptimiseResponse; before: WantListItem[]; after: string; prefs: string };

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
    trackEvent("optimise-pref", { pref });
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // not persisted; still applies this visit
    }
    return next;
  }

  const prefsKey = (p: SavedPrefs) => JSON.stringify(requestPrefs(p, storeShippingOverrides));
  // The plan still describes the list only while neither the list nor the prefs have moved.
  const fresh = optimised !== null && optimised.after === JSON.stringify(items) && optimised.prefs === prefsKey(prefs);

  async function optimise(withPrefs: SavedPrefs = prefs) {
    const data = await optimiser.run(JSON.stringify({ lines: toLines(items), prefs: requestPrefs(withPrefs, storeShippingOverrides) }));
    if (!data) return;
    const after = applyPlan(items, data);
    // Chained runs (a store-count chip, "Don't use this store") keep the original list for Undo.
    const before = optimised && fresh ? optimised.before : items;
    replaceItems(after);
    setOptimised({ data, before, after: JSON.stringify(after), prefs: prefsKey(withPrefs) });
    trackEvent("optimise-apply", {
      version: "v2",
      lines: items.length,
      stores: data.plan.totals.storeCount,
      saving: data.savingsCents === null ? null : Math.round(data.savingsCents / 100),
    });
  }

  function undo() {
    if (!optimised) return;
    replaceItems(optimised.before);
    setOptimised(null);
    trackEvent("optimise-undo");
  }

  function handleExclude(store: PlanStore) {
    trackEvent("optimise-exclude-store", { store: store.storeId });
    optimise(changePrefs({ excludeStores: [...prefs.excludeStores, store.storeId] }, "stores"));
  }

  function handleMaxStores(n: number | null) {
    trackEvent("optimise-alt", { stores: n });
    optimise(changePrefs({ maxStores: n }, "max-stores"));
  }

  const itemsById = new Map(items.map((i) => [i.id, i]));
  const flatCents = (storeId: string) => {
    const aud = storeShippingOverrides[storeId] ?? rates[storeId];
    return aud == null ? null : Math.round(aud * 100);
  };
  const plan = fresh ? optimised.data : null;
  // Exact postage, waivers and free-postage gaps from the plan when it's current.
  const storeList = listStores(items, flatCents).map((s) => {
    const p = plan?.plan.stores.find((ps) => ps.storeId === s.storeId);
    return p ? { ...s, postageCents: p.postageCents, postageWaived: p.postageWaived, freeShippingGapCents: p.freeShippingGapCents } : s;
  });
  const estimate = storeList.reduce((sum, s) => sum + s.subtotalCents + s.postageCents, 0);
  const postage = storeList.reduce((sum, s) => sum + s.postageCents, 0);

  // Flags describe what the plan changed, keyed by the item each planned listing became.
  const rowFlags = new Map<string, RowFlags>();
  if (plan && optimised) {
    const before = new Map(optimised.before.map((i) => [i.id, i]));
    for (const u of plan.plan.stores.flatMap((s) => s.units)) {
      rowFlags.set(wantListItemId(u.offer.printingId, u.offer.storeId, u.offer.url), {
        flags: u.flags, prevCondition: before.get(u.lineId)?.condition ?? null,
      });
    }
  }
  const unavailable = plan?.unavailable ?? [];
  const copies = items.reduce((n, i) => n + itemQty(i), 0);
  const flatStores = storeList.filter((s) => s.kind === "flat").length;

  return (
    <CardPreviewProvider>
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-cream">Want List</h1>
            {items.length > 0 && (
              <p className="mt-0.5 text-sm text-cream-dim">{plural(items.length, "card")} · {plural(copies, "copy", "copies")}</p>
            )}
          </div>
          {items.length > 0 && (
            <button onClick={() => { clearAll(); setOptimised(null); }} className="text-xs text-cream-dim hover:text-red-400 transition-colors">
              Clear all
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="mb-6 rounded-lg border border-subtle bg-surface px-6 py-10 text-center">
            <p className="mb-1 text-cream">Your want list is empty.</p>
            <p className="text-sm text-cream-dim">Paste a deck list below, or click <span className="text-price">+</span> on any card.</p>
          </div>
        ) : (
          <>
            {/* Sticky, so the total and Optimise stay in reach while scrolling on a phone. */}
            <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-subtle bg-bg/95 px-4 py-2.5 backdrop-blur" aria-live="polite">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xl font-bold text-price">
                      {plan ? cents(plan.plan.totals.totalCents) : `~${cents(estimate)}`}
                    </span>
                    <span className="text-sm text-cream-dim">
                      {plural(plan ? plan.plan.totals.storeCount : flatStores, "store")} · postage {cents(plan ? plan.plan.totals.postageCents : postage)}
                    </span>
                  </div>
                  <p className="text-xs text-cream-dim">
                    {plan ? (
                      <>
                        {plan.savingsCents !== null && plan.savingsCents > 0
                          ? <span className="text-green-400">Optimised — saved {cents(plan.savingsCents)}. </span>
                          : <span>Optimised — {plan.savingsCents === 0 ? "already the cheapest. " : "done. "}</span>}
                        <button onClick={undo} className="text-accent-light hover:underline">Undo</button>
                      </>
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
                  className="shrink-0 rounded-lg bg-cta px-4 py-2 text-sm font-semibold text-white hover:bg-price disabled:opacity-60 disabled:hover:bg-cta transition-colors"
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
                      aria-pressed={c.active}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                        c.active ? "border-accent bg-accent/10 text-accent-light" : "border-subtle text-cream-dim hover:text-cream"
                      }`}
                    >
                      {plural(c.n, "store")} · {cents(c.total)}
                    </button>
                  ))}
                  {prefs.maxStores !== null && (
                    <button onClick={() => handleMaxStores(null)} className="shrink-0 rounded-full border border-subtle px-3 py-1 text-xs text-cream-dim hover:text-cream">
                      Any number
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* One row on a phone, scrolled sideways, rather than three rows of pills. */}
            <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
              <PrefsBar prefs={prefs} stores={stores} onChange={changePrefs} />
            </div>

            {unavailable.length > 0 && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-surface px-3 py-2.5 text-sm">
                <p className="font-semibold text-cream">Couldn’t find a better listing for</p>
                <ul className="text-cream-dim">
                  {unavailable.map((u) => (
                    <li key={u.lineId}>
                      <a href={cardHref(itemsById.get(u.lineId)?.cardSlug, u.cardId)} className="text-cream hover:text-accent">{u.cardName}</a>
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
                  {store.storeId === "ebay_au" && <AffiliateDisclosure className="!mb-2 px-1" />}
                  <StoreSection
                    store={store}
                    itemsById={itemsById}
                    flagsFor={(id) => rowFlags.get(id)}
                    exact={plan !== null}
                    onExclude={() => handleExclude(store)}
                  />
                </React.Fragment>
              ))}
            </div>
          </>
        )}

        <ImportCards />
      </div>
    </CardPreviewProvider>
  );
}
