"use client";

import { useState } from "react";
import { BuyLink } from "@/app/BuyLink";
import { useWantList, type WantListItem } from "@/app/WantListContext";
import { cardHref, fmtAUD, toSmallImage, trackEvent } from "@/lib/utils";
import { variantBadgeWithFoil } from "@/lib/variant-utils";
import { MAX_CARD_QTY } from "@/lib/config";
import { itemQty } from "@/lib/optimiser/want-list";
import type { PlanStore, PlanUnit, UnitFlags } from "@/lib/optimiser/types";
import { EditablePostageRow } from "./EditablePostageRow";
import { useCardHover } from "./CardPreview";

const cents = (c: number) => fmtAUD(c / 100);

/** What the last optimise changed about a card, as small warning chips. */
export type RowFlags = { flags: UnitFlags; prevCondition: string | null };

function Flags({ unit, flags }: { unit: PlanUnit; flags: RowFlags }) {
  const chips: string[] = [];
  const f = flags.flags;
  if (f.printingChanged) chips.push("different printing");
  if (f.conditionChanged && !f.conditionUnknown) chips.push(`${flags.prevCondition ?? "?"} → ${unit.offer.condition}`);
  if (f.conditionUnknown) chips.push("condition not stated");
  if (f.stockUnconfirmed) chips.push(`stock for ${unit.qty} not confirmed`);
  return chips.map((c) => (
    <span key={c} className="rounded border border-amber-500/40 px-1.5 py-px text-[11px] text-amber-300">{c}</span>
  ));
}

/**
 * One card on the list, at the listing it's bought from. The controls edit what
 * the user wants (qty, printing mode); Optimise then finds where to buy it.
 */
export function CardRow({ unit, item, flags }: { unit: PlanUnit; item: WantListItem; flags?: RowFlags }) {
  const { updateItem, removeItem } = useWantList();
  const hover = useCardHover()(unit.offer.imageUri ?? item.imageUri);
  const qty = itemQty(item);
  const mode = item.printingMode ?? "any";
  const badge = variantBadgeWithFoil(unit.offer);
  const thumb = toSmallImage(unit.offer.imageUri ?? item.imageUri);

  return (
    <li className="flex gap-3 border-b border-subtle/60 px-3 py-2.5 last:border-0">
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" width={36} height={50} className="h-[50px] w-9 shrink-0 rounded-sm object-cover" loading="lazy" {...hover} />
      ) : <span className="h-[50px] w-9 shrink-0 rounded-sm bg-muted" />}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a href={cardHref(item.cardSlug, item.cardId)} className="font-medium text-cream hover:text-accent" {...hover}>
              {item.cardName}
            </a>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-cream-dim">
              <span>{unit.offer.setName}</span>
              {badge && <span className="text-accent-light">{badge}</span>}
              {unit.offer.condition && <span>{unit.offer.condition}</span>}
              {flags && <Flags unit={unit} flags={flags} />}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold text-price whitespace-nowrap">{cents(unit.offer.priceCents * unit.qty)}</div>
            {unit.qty > 1 && <div className="text-[11px] text-cream-dim whitespace-nowrap">{cents(unit.offer.priceCents)} each</div>}
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-subtle text-xs" role="group" aria-label={`Printing for ${item.cardName}`}>
            {(["any", "exact"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { updateItem(item.id, { printingMode: m }); trackEvent("optimise-line-mode", { mode: m }); }}
                aria-pressed={mode === m}
                className={`px-2 py-1 first:rounded-l-lg last:rounded-r-lg transition-colors ${
                  mode === m ? "bg-accent/20 text-cream" : "text-cream-dim hover:text-cream"
                }`}
              >
                {m === "any" ? "Any" : "This"}<span className="hidden sm:inline"> printing</span>
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-lg border border-subtle text-sm" role="group" aria-label={`Quantity of ${item.cardName}`}>
            <button
              onClick={() => qty > 1 ? updateItem(item.id, { qty: qty - 1 }) : removeItem(item.id)}
              aria-label={qty > 1 ? `One fewer ${item.cardName}` : `Remove ${item.cardName}`}
              className="px-2.5 py-0.5 text-cream-dim hover:text-cream"
            >
              −
            </button>
            <span className="w-6 text-center text-cream">{qty}</span>
            <button
              onClick={() => updateItem(item.id, { qty: Math.min(qty + 1, MAX_CARD_QTY) })}
              disabled={qty >= MAX_CARD_QTY}
              aria-label={`One more ${item.cardName}`}
              className="px-2.5 py-0.5 text-cream-dim hover:text-cream disabled:opacity-40"
            >
              +
            </button>
          </div>

          <span className="flex-1" />
          {unit.offer.url && (
            <BuyLink
              href={unit.offer.url}
              storeId={unit.offer.storeId}
              card={item.cardName}
              price={unit.offer.priceCents / 100}
              source="want-list"
              printingId={unit.offer.printingId}
              className="text-xs text-price hover:text-cream transition-colors"
            />
          )}
          <button
            onClick={() => removeItem(item.id)}
            aria-label={`Remove ${item.cardName}`}
            className="flex h-6 w-6 items-center justify-center rounded text-cream-dim hover:bg-red-900/20 hover:text-red-400"
          >
            ×
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * A store on the list: what's bought there, its postage, and a way to drop it.
 * `exact` says the postage comes from the optimiser rather than an estimate.
 */
export function StoreSection({
  store,
  itemsById,
  flagsFor,
  exact,
  onExclude,
}: {
  store: PlanStore;
  itemsById: Map<string, WantListItem>;
  flagsFor: (itemId: string) => RowFlags | undefined;
  exact: boolean;
  onExclude: () => void;
}) {
  const { storeShippingOverrides, setStoreShipping } = useWantList();
  const [collapsed, setCollapsed] = useState(false);
  const units = store.units.filter((u) => itemsById.has(u.lineId));
  if (units.length === 0) return null;
  const copies = units.reduce((n, u) => n + u.qty, 0);

  return (
    <section className="rounded-lg border border-subtle bg-surface" aria-label={store.storeName}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className={`flex w-full items-baseline justify-between gap-2 bg-cream-muted px-3 py-2.5 text-left hover:bg-muted transition-colors ${
          collapsed ? "rounded-lg" : "rounded-t-lg border-b border-subtle"
        }`}
      >
        <h3 className="font-semibold text-cream">{store.storeName}</h3>
        <span className="shrink-0 text-sm text-cream-dim">
          {copies} card{copies === 1 ? "" : "s"}
          {" · "}<span className="font-semibold text-price">{exact ? "" : "~"}{cents(store.subtotalCents + store.postageCents)}</span>
          <span className="ml-2 text-xs opacity-60" aria-hidden>{collapsed ? "▶" : "▼"}</span>
        </span>
      </button>

      {!collapsed && (
        <>
          <ul>
            {units.map((u) => (
              <CardRow
                key={`${u.lineId}-${u.offer.url}`}
                unit={u}
                item={itemsById.get(u.lineId)!}
                flags={flagsFor(u.lineId)}
              />
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-subtle bg-cream-muted/50 px-3 py-2 rounded-b-lg text-xs">
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
          </div>
        </>
      )}
    </section>
  );
}
