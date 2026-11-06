"use client";

import React from "react";
import { BuyLink } from "@/app/BuyLink";
import { AffiliateDisclosure } from "@/app/AffiliateDisclosure";
import { useWantList, type WantListItem } from "@/app/WantListContext";
import { cardHref, fmtAUD } from "@/lib/utils";
import { variantBadgeWithFoil } from "@/lib/variant-utils";
import { EditablePostageRow } from "../EditablePostageRow";
import { useCardHover } from "./CardPreview";
import type { OptimiseResponse, PlanStore, PlanUnit, Unavailable } from "@/lib/optimiser/types";

const cents = (c: number) => fmtAUD(c / 100);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Savings({ data }: { data: OptimiseResponse }) {
  const s = data.savingsCents;
  if (s === null) {
    return (
      <p className="text-sm text-cream-dim">
        Not compared with your current picks — some are sold out, or the plan can’t cover every copy.
      </p>
    );
  }
  if (s > 0) return <p className="text-sm font-semibold text-green-400">Saves {cents(s)} on your current picks</p>;
  if (s === 0) return <p className="text-sm text-cream-dim">Your current picks are already the cheapest.</p>;
  return (
    <p className="text-sm text-cream-dim">
      {cents(-s)} more than your current picks, which don’t all meet your preferences.
    </p>
  );
}

const UNAVAILABLE_REASON: Record<Unavailable["reason"], string> = {
  "no-listings": "not in stock anywhere",
  "no-match": "none in stock that match your preferences",
  short: "not enough copies in stock",
};

function Flags({ unit, item }: { unit: PlanUnit; item: WantListItem | undefined }) {
  const chips: string[] = [];
  if (unit.flags.printingChanged) chips.push("different printing");
  if (unit.flags.conditionChanged && !unit.flags.conditionUnknown && item) {
    chips.push(`${item.condition ?? "?"} → ${unit.offer.condition}`);
  }
  if (unit.flags.conditionUnknown) chips.push("condition not stated");
  if (unit.flags.stockUnconfirmed) chips.push(`stock for ${unit.qty} not confirmed`);
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c} className="rounded border border-amber-500/40 px-1.5 py-px text-[11px] text-amber-300">{c}</span>
      ))}
    </span>
  );
}

function StoreCard({
  store,
  itemsById,
  onExclude,
}: {
  store: PlanStore;
  itemsById: Map<string, WantListItem>;
  onExclude: () => void;
}) {
  const { storeShippingOverrides, setStoreShipping } = useWantList();
  const hover = useCardHover();
  const copies = store.units.reduce((n, u) => n + u.qty, 0);

  return (
    <section className="rounded-lg border border-subtle bg-surface" aria-label={store.storeName}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-subtle bg-cream-muted px-4 py-2.5 rounded-t-lg">
        <h3 className="font-semibold text-cream">{store.storeName}</h3>
        <span className="text-sm text-cream-dim">
          {plural(copies, "card")} · <span className="font-semibold text-price">{cents(store.subtotalCents + store.postageCents)}</span>
        </span>
      </header>

      <ul>
        {store.units.map((u) => {
          const badge = variantBadgeWithFoil(u.offer);
          return (
            <li key={`${u.lineId}-${u.offer.url}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-subtle/60 px-4 py-2 last:border-0">
              <span className="w-8 shrink-0 text-sm font-semibold text-cream">{u.qty}×</span>
              <div className="min-w-0 flex-1">
                {/* The planned printing's art, which may differ from the one on the list. */}
                <a href={cardHref(itemsById.get(u.lineId)?.cardSlug, u.cardId)} className="font-medium text-cream hover:text-accent" {...hover(u.offer.imageUri)}>
                  {u.cardName}
                </a>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-cream-dim">
                  <span>{u.offer.setName}</span>
                  {badge && <span className="text-accent-light">{badge}</span>}
                  {u.offer.condition && <span>{u.offer.condition}</span>}
                  <Flags unit={u} item={itemsById.get(u.lineId)} />
                </div>
              </div>
              <span className="whitespace-nowrap text-sm font-semibold text-price">
                {cents(u.offer.priceCents)}{u.qty > 1 && <span className="font-normal text-cream-dim"> each</span>}
              </span>
              {u.offer.url && (
                <BuyLink
                  href={u.offer.url}
                  storeId={u.offer.storeId}
                  card={u.cardName}
                  price={u.offer.priceCents / 100}
                  source="optimiser"
                  printingId={u.offer.printingId}
                  className="text-xs text-price hover:text-cream transition-colors"
                />
              )}
            </li>
          );
        })}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-subtle bg-cream-muted/50 px-4 py-2 rounded-b-lg text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-cream-dim">
          {store.kind === "per-item" ? (
            <span>Postage {cents(store.postageCents)} (each listing ships separately)</span>
          ) : store.postageWaived ? (
            <span className="text-green-400">Free postage at this order size</span>
          ) : (
            <EditablePostageRow
              amount={store.postageCents / 100}
              isOverride={store.storeId in storeShippingOverrides}
              onSave={(amt) => setStoreShipping(store.storeId, amt)}
            />
          )}
          {store.freeShippingGapCents !== null && (
            <span>Spend {cents(store.freeShippingGapCents)} more here for free postage</span>
          )}
        </div>
        <button onClick={onExclude} className="text-cream-dim hover:text-red-400 transition-colors">
          {store.kind === "per-item" ? "Don’t use eBay" : "Don’t use this store"}
        </button>
      </footer>
    </section>
  );
}

/** The cheapest plan for the want list under the current preferences. */
export function PlanView({
  data,
  stale,
  items,
  maxStores,
  onMaxStores,
  onExclude,
  onApply,
}: {
  data: OptimiseResponse;
  /** The list or prefs changed since `data` was computed; a re-run is on its way. */
  stale: boolean;
  items: WantListItem[];
  maxStores: number | null;
  onMaxStores: (n: number | null) => void;
  onExclude: (store: PlanStore) => void;
  onApply: () => void;
}) {
  const { totals } = data.plan;
  const hover = useCardHover();
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const unchanged = data.savingsCents === 0;
  const chips = [
    ...data.alternatives.map((a) => ({ n: a.storeCount, total: a.totalCents, active: false })),
    { n: totals.storeCount, total: totals.totalCents, active: true },
  ];

  const apply = (
    <button
      onClick={onApply}
      disabled={stale || totals.unitsFilled === 0 || unchanged}
      className="rounded-lg bg-cta px-4 py-2 text-sm font-semibold text-white hover:bg-price disabled:opacity-50 disabled:hover:bg-cta transition-colors"
    >
      {unchanged ? "Already using this plan" : "Use this plan"}
    </button>
  );

  return (
    <div className={`space-y-4 transition-opacity ${stale ? "opacity-60" : ""}`}>
      {/* Summary */}
      <div className="rounded-lg border border-accent-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-cream-dim">
              {data.proven ? "Cheapest plan" : "Best plan found"}
            </p>
            <p className="text-2xl font-bold text-price">{cents(totals.totalCents)}</p>
            <p className="text-xs text-cream-dim">
              cards {cents(totals.cardsCents)} + postage {cents(totals.postageCents)} ·{" "}
              {plural(totals.storeCount, "store")}
              {totals.parcelCount > totals.storeCount && ` · ${plural(totals.parcelCount, "parcel")}`}
              {" · "}{totals.unitsFilled}/{plural(totals.unitsWanted, "card")}
            </p>
          </div>
          <div className="hidden sm:block">{apply}</div>
        </div>
        <div className="mt-2"><Savings data={data} /></div>

        {(chips.length > 1 || maxStores !== null) && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Number of stores">
            {chips.map((c) => (
              <button
                key={c.n}
                onClick={() => onMaxStores(c.n)}
                aria-pressed={c.active}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  c.active ? "border-accent bg-accent/10 text-accent-light" : "border-subtle text-cream-dim hover:text-cream"
                }`}
              >
                {plural(c.n, "store")} · {cents(c.total)}
              </button>
            ))}
            {maxStores !== null && (
              <button onClick={() => onMaxStores(null)} className="rounded-full border border-subtle px-3 py-1 text-xs text-cream-dim hover:text-cream">
                Any number of stores
              </button>
            )}
          </div>
        )}
      </div>

      {data.unavailable.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-surface px-4 py-3 text-sm">
          <p className="mb-1 font-semibold text-cream">Not covered by this plan</p>
          <ul className="space-y-0.5 text-cream-dim">
            {data.unavailable.map((u) => (
              <li key={u.lineId}>
                <a href={cardHref(itemsById.get(u.lineId)?.cardSlug, u.cardId)} className="text-cream hover:text-accent" {...hover(itemsById.get(u.lineId)?.imageUri ?? null)}>{u.cardName}</a>
                {" "}— {u.reason === "short" ? `${u.missing} short, ` : ""}{UNAVAILABLE_REASON[u.reason]}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.plan.stores.map((store) => (
        <React.Fragment key={store.storeId}>
          {/* EPN / ACL: disclosure must directly precede the affiliate links */}
          {store.storeId === "ebay_au" && <AffiliateDisclosure className="!mb-2 px-1" />}
          <StoreCard store={store} itemsById={itemsById} onExclude={() => onExclude(store)} />
        </React.Fragment>
      ))}

      {/* Phones: keep the total and the action in reach while scrolling the stores. */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-subtle bg-surface px-4 py-3 sm:hidden">
        <span className="font-bold text-price">{cents(totals.totalCents)}</span>
        {apply}
      </div>
    </div>
  );
}
