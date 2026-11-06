"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useWantList, type WantListItem } from "@/app/WantListContext";
import { cardHref, fmtAUD, toSmallImage, trackEvent } from "@/lib/utils";
import { variantBadgeWithFoil } from "@/lib/variant-utils";
import { MAX_CARD_QTY } from "@/lib/config";
import {
  applyPlan, itemQty, parseSavedPrefs, requestPrefs, toLines, PREFS_KEY, type SavedPrefs,
} from "@/lib/optimiser/want-list";
import type { OptimiseResponse, PlanStore } from "@/lib/optimiser/types";
import type { StoreSummary } from "@/lib/store-shipping";
import { ImportCards } from "../ImportCards";
import { PrefsBar } from "./PrefsBar";
import { PlanView } from "./PlanView";
import { useOptimisePlan } from "./useOptimisePlan";
import { CardPreviewProvider, useCardHover } from "./CardPreview";

/** What the last plan said about the listing the user has now. */
function currentStatus(item: WantListItem, data: OptimiseResponse | null): ReactNode {
  if (!data) return null;
  if (data.current.missing.includes(item.id)) {
    return <span className="text-xs text-red-400">no longer listed</span>;
  }
  const repriced = data.current.repriced.find((r) => r.lineId === item.id);
  if (repriced) return <span className="text-xs text-amber-300">now {fmtAUD(repriced.nowCents / 100)}</span>;
  return null;
}

function LineRow({ item, data }: { item: WantListItem; data: OptimiseResponse | null }) {
  const { updateItem, removeItem } = useWantList();
  const hover = useCardHover()(item.imageUri);
  const qty = itemQty(item);
  const mode = item.printingMode ?? "any";
  const badge = variantBadgeWithFoil(item);
  const thumb = toSmallImage(item.imageUri);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-subtle/60 px-3 py-2 last:border-0">
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" width={32} height={45} className="h-[45px] w-8 shrink-0 rounded-sm object-cover" loading="lazy" {...hover} />
      ) : <span className="h-[45px] w-8 shrink-0 rounded-sm bg-muted" />}

      <div className="min-w-0 flex-1 basis-40">
        <a href={cardHref(item.cardSlug, item.cardId)} className="font-medium text-cream hover:text-accent" {...hover}>{item.cardName}</a>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-cream-dim">
          <span>{item.setName}</span>
          {badge && <span className="text-accent-light">{badge}</span>}
          {item.condition && <span>{item.condition}</span>}
          <span>· {item.storeName}</span>
          {currentStatus(item, data)}
        </div>
      </div>

      <div className="flex rounded-lg border border-subtle text-xs" role="group" aria-label={`Printing for ${item.cardName}`}>
        {(["exact", "any"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { updateItem(item.id, { printingMode: m }); trackEvent("optimise-line-mode", { mode: m }); }}
            aria-pressed={mode === m}
            className={`px-2 py-1 first:rounded-l-lg last:rounded-r-lg transition-colors ${
              mode === m ? "bg-accent/20 text-cream" : "text-cream-dim hover:text-cream"
            }`}
          >
            {m === "exact" ? "This printing" : "Any printing"}
          </button>
        ))}
      </div>

      <div className="flex items-center rounded-lg border border-subtle text-sm" role="group" aria-label={`Quantity of ${item.cardName}`}>
        <button
          onClick={() => qty > 1 ? updateItem(item.id, { qty: qty - 1 }) : removeItem(item.id)}
          aria-label={qty > 1 ? `One fewer ${item.cardName}` : `Remove ${item.cardName}`}
          className="px-2 py-0.5 text-cream-dim hover:text-cream"
        >
          −
        </button>
        <span className="w-6 text-center text-cream" aria-live="polite">{qty}</span>
        <button
          onClick={() => updateItem(item.id, { qty: Math.min(qty + 1, MAX_CARD_QTY) })}
          disabled={qty >= MAX_CARD_QTY}
          aria-label={`One more ${item.cardName}`}
          className="px-2 py-0.5 text-cream-dim hover:text-cream disabled:opacity-40"
        >
          +
        </button>
      </div>

      <span className="w-20 text-right text-sm font-semibold text-price whitespace-nowrap">{fmtAUD(item.priceAud * qty)}</span>

      <button
        onClick={() => removeItem(item.id)}
        aria-label={`Remove ${item.cardName}`}
        className="flex h-6 w-6 items-center justify-center rounded text-cream-dim hover:bg-red-900/20 hover:text-red-400"
      >
        ×
      </button>
    </li>
  );
}

/**
 * The v2 want list: each card has a quantity and a printing mode, preferences
 * steer the optimiser, and the plan is shown inline, store by store, rather than
 * as a per-card diff in a modal. Behind the optimiser_v2 flag; see page.tsx.
 */
export function WantListV2({ stores, toggle }: { stores: StoreSummary[]; toggle: ReactNode }) {
  const { items, clearAll, replaceItems, storeShippingOverrides } = useWantList();
  const [prefs, setPrefs] = useState<SavedPrefs>(() => parseSavedPrefs(null));
  const [planWanted, setPlanWanted] = useState(false);
  const [applied, setApplied] = useState(false);

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
    setPlanWanted(true);
    trackEvent("optimise-pref", { pref });
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // not persisted; still applies this visit
    }
  }

  const body = useMemo(
    () => items.length > 0 && planWanted
      ? JSON.stringify({ lines: toLines(items), prefs: requestPrefs(prefs, storeShippingOverrides) })
      : null,
    [items, prefs, storeShippingOverrides, planWanted],
  );
  const plan = useOptimisePlan(body);
  const stale = plan.dataBody !== body;
  const copies = items.reduce((n, i) => n + itemQty(i), 0);

  function handleApply() {
    if (!plan.data || stale) return;
    replaceItems(applyPlan(items, plan.data));
    setApplied(true);
    trackEvent("optimise-apply", {
      version: "v2",
      lines: items.length,
      stores: plan.data.plan.totals.storeCount,
      saving: plan.data.savingsCents === null ? null : Math.round(plan.data.savingsCents / 100),
    });
  }

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
      <div className="mb-4 flex items-start justify-between gap-4">
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

      {toggle}

      {items.length === 0 ? (
        <div className="mb-6 rounded-lg border border-subtle bg-surface px-6 py-10 text-center">
          <p className="mb-1 text-cream">Your want list is empty.</p>
          <p className="text-sm text-cream-dim">Paste a deck list below, or click <span className="text-price">+</span> on any card.</p>
        </div>
      ) : (
        <>
          <ul className="mb-6 rounded-lg border border-subtle bg-surface" aria-label="Cards on your want list">
            {items.map((item) => <LineRow key={item.id} item={item} data={plan.data} />)}
          </ul>

          <section className="mb-8 space-y-4" aria-labelledby="plan-heading" aria-busy={plan.loading}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="plan-heading" className="text-lg font-semibold text-cream">Where to buy</h2>
              <PrefsBar prefs={prefs} stores={stores} onChange={changePrefs} />
            </div>

            <div aria-live="polite" className="text-sm">
              {plan.loading && <p className="text-cream-dim">Finding the cheapest plan…</p>}
              {applied && !plan.loading && plan.data?.savingsCents === 0 && (
                <p className="text-green-400">Plan applied — your want list now uses it.</p>
              )}
              {plan.error && (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/40 bg-surface px-4 py-3">
                  <span className="text-cream">{plan.error}</span>
                  <button onClick={plan.retry} className="text-accent-light hover:underline">Try again</button>
                </div>
              )}
            </div>

            {!planWanted ? (
              <div className="rounded-lg border border-accent-border bg-surface px-4 py-6 text-center">
                <p className="mb-3 text-sm text-cream-dim">
                  Find the cheapest way to buy {copies === 1 ? "this card" : `all ${copies} copies`} across every store we track, postage included.
                </p>
                <button
                  onClick={() => setPlanWanted(true)}
                  className="rounded-lg bg-cta px-4 py-2 text-sm font-semibold text-white hover:bg-price transition-colors"
                >
                  Find the cheapest plan
                </button>
              </div>
            ) : plan.data && (
              <PlanView
                data={plan.data}
                stale={stale}
                items={items}
                maxStores={prefs.maxStores}
                onMaxStores={handleMaxStores}
                onExclude={handleExclude}
                onApply={handleApply}
              />
            )}
          </section>
        </>
      )}

      <ImportCards />
    </div>
    </CardPreviewProvider>
  );
}

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}
