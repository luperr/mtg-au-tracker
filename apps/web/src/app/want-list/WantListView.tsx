"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useWantList, type WantListItem } from "@/app/WantListContext";
import { AffiliateDisclosure } from "@/app/AffiliateDisclosure";
import { fmtAUD, trackEvent } from "@/lib/utils";
import {
  baselineStores, itemQty, parseSavedPrefs, requestPrefs, toLines, PREFS_KEY, type SavedPrefs,
} from "@/lib/optimiser/want-list";
import type { OptimiseResponse, PlanStore, PlanUnit, Unavailable } from "@/lib/optimiser/types";
import type { StoreSummary } from "@/lib/store-shipping";
import { ImportCards } from "./ImportCards";
import { PrefsBar } from "./PrefsBar";
import { CardRow, StoreSection } from "./StoreSection";
import { CardPreviewProvider } from "./CardPreview";
import { useOptimisePlan } from "./useOptimisePlan";

const cents = (c: number) => fmtAUD(c / 100);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const UNAVAILABLE_REASON: Record<Unavailable["reason"], string> = {
  "no-listings": "not in stock anywhere",
  "no-match": "none in stock that match your preferences",
  short: "not enough copies in stock",
};

function Savings({ data }: { data: OptimiseResponse }) {
  const s = data.savingsCents;
  if (s === null || s === 0) return null;
  return s > 0
    ? <span className="text-green-400">saves {cents(s)}</span>
    : <span className="text-cream-dim">{cents(-s)} more than when added</span>;
}

/** The total, the store-count choices and the plan's status. Sticky, so it stays in reach on a phone. */
function Summary({
  data,
  loading,
  error,
  onRetry,
  maxStores,
  onMaxStores,
}: {
  data: OptimiseResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  maxStores: number | null;
  onMaxStores: (n: number | null) => void;
}) {
  const totals = data?.plan.totals;
  const chips = data
    ? [
        ...data.alternatives.map((a) => ({ n: a.storeCount, total: a.totalCents, active: false })),
        { n: data.plan.totals.storeCount, total: data.plan.totals.totalCents, active: true },
      ]
    : [];

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-subtle bg-bg/95 px-4 py-2.5 backdrop-blur" aria-live="polite">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        {totals ? (
          <>
            <span className="text-xl font-bold text-price">{cents(totals.totalCents)}</span>
            <span className="text-sm text-cream-dim">
              {plural(totals.storeCount, "store")}
              {totals.parcelCount > totals.storeCount && ` + ${plural(totals.parcelCount - totals.storeCount, "eBay parcel")}`}
              {" · "}postage {cents(totals.postageCents)}
            </span>
            <span className="text-sm"><Savings data={data!} /></span>
          </>
        ) : (
          <span className="text-sm text-cream-dim">{error ? "" : "Finding the cheapest way to buy your list…"}</span>
        )}
        {loading && totals && <span className="text-xs text-cream-dim">updating…</span>}
      </div>

      {error && (
        <div role="alert" className="mt-1 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-red-400">{error}</span>
          <button onClick={onRetry} className="text-accent-light hover:underline">Try again</button>
        </div>
      )}

      {(chips.length > 1 || maxStores !== null) && (
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Number of stores">
          {chips.map((c) => (
            <button
              key={c.n}
              onClick={() => onMaxStores(c.n)}
              aria-pressed={c.active}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                c.active ? "border-accent bg-accent/10 text-accent-light" : "border-subtle text-cream-dim hover:text-cream"
              }`}
            >
              {plural(c.n, "store")} · {cents(c.total)}
            </button>
          ))}
          {maxStores !== null && (
            <button onClick={() => onMaxStores(null)} className="shrink-0 rounded-full border border-subtle px-3 py-1 text-xs text-cream-dim hover:text-cream">
              Any number
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The want list, laid out as the cheapest way to buy it: each card sits under the
 * store the optimiser buys it from, with its quantity and printing controls in
 * place. The plan re-runs as the list or preferences change, so there's nothing
 * to apply. Until the first plan arrives, cards sit under the store they were
 * added from.
 */
export function WantListView({ stores }: { stores: StoreSummary[] }) {
  const { items, clearAll, storeShippingOverrides } = useWantList();
  const [prefs, setPrefs] = useState<SavedPrefs>(() => parseSavedPrefs(null));

  useEffect(() => {
    try {
      setPrefs(parseSavedPrefs(localStorage.getItem(PREFS_KEY)));
    } catch {
      // storage blocked: defaults stand
    }
  }, []);

  function changePrefs(patch: Partial<SavedPrefs>, pref: string) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    trackEvent("optimise-pref", { pref });
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // not persisted; still applies this visit
    }
  }

  const body = useMemo(
    () => items.length > 0
      ? JSON.stringify({ lines: toLines(items), prefs: requestPrefs(prefs, storeShippingOverrides) })
      : null,
    [items, prefs, storeShippingOverrides],
  );
  const plan = useOptimisePlan(body);
  const itemsById = new Map(items.map((i) => [i.id, i]));

  // A plan for an older version of the list still places its cards; cards added
  // since then wait for the re-run that's already on its way.
  const planned = plan.data !== null;
  const storeList: PlanStore[] = plan.data ? plan.data.plan.stores : baselineStores(items);
  const unavailable = (plan.data?.unavailable ?? []).filter((u) => itemsById.has(u.lineId));
  // Cards whose copies the plan buys from more than one store.
  const unitsPerLine = new Map<string, number>();
  for (const u of storeList.flatMap((s) => s.units)) unitsPerLine.set(u.lineId, (unitsPerLine.get(u.lineId) ?? 0) + 1);
  const splitLines = new Set([...unitsPerLine].filter(([, n]) => n > 1).map(([id]) => id));
  const copies = items.reduce((n, i) => n + itemQty(i), 0);

  function handleExclude(store: PlanStore) {
    changePrefs({ excludeStores: [...prefs.excludeStores, store.storeId] }, "stores");
    trackEvent("optimise-exclude-store", { store: store.storeId });
  }

  function handleMaxStores(n: number | null) {
    changePrefs({ maxStores: n }, "max-stores");
    trackEvent("optimise-alt", { stores: n });
  }

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
            <button onClick={clearAll} className="text-xs text-cream-dim hover:text-red-400 transition-colors">Clear all</button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="mb-6 rounded-lg border border-subtle bg-surface px-6 py-10 text-center">
            <p className="mb-1 text-cream">Your want list is empty.</p>
            <p className="text-sm text-cream-dim">Paste a deck list below, or click <span className="text-price">+</span> on any card.</p>
          </div>
        ) : (
          <>
            <Summary
              data={plan.data}
              loading={plan.loading}
              error={plan.error}
              onRetry={plan.retry}
              maxStores={prefs.maxStores}
              onMaxStores={handleMaxStores}
            />

            {/* One row on a phone, scrolled sideways, rather than three rows of pills. */}
            <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
              <PrefsBar prefs={prefs} stores={stores} onChange={changePrefs} />
            </div>

            <div className={`mb-8 space-y-3 transition-opacity ${plan.loading && planned ? "opacity-70" : ""}`}>
              {storeList.map((store) => (
                <React.Fragment key={store.storeId}>
                  {/* EPN / ACL: disclosure must directly precede the affiliate links */}
                  {store.storeId === "ebay_au" && <AffiliateDisclosure className="!mb-2 px-1" />}
                  <StoreSection store={store} itemsById={itemsById} splitLines={splitLines} planned={planned} onExclude={() => handleExclude(store)} />
                </React.Fragment>
              ))}

              {unavailable.length > 0 && (
                <section className="rounded-lg border border-red-500/30 bg-surface" aria-label="Can't buy right now">
                  <h3 className="border-b border-subtle px-3 py-2.5 font-semibold text-cream">Can’t buy right now</h3>
                  <ul>
                    {unavailable.map((u) => {
                      const item = itemsById.get(u.lineId)!;
                      return (
                        <CardRow
                          key={u.lineId}
                          unit={addedListing(item, u.missing)}
                          item={item}
                          note={u.reason === "short" ? `${u.missing} short — ${UNAVAILABLE_REASON.short}` : UNAVAILABLE_REASON[u.reason]}
                        />
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          </>
        )}

        <ImportCards />
      </div>
    </CardPreviewProvider>
  );
}

/** A card the plan can't buy, shown at the listing it was added at — with no buy link, since it's gone or ruled out. */
function addedListing(item: WantListItem, qty: number): PlanUnit {
  const unit = baselineStores([{ ...item, qty }])[0].units[0];
  return { ...unit, offer: { ...unit.offer, url: null } };
}
