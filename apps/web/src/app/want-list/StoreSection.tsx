"use client";

import { useState } from "react";
import { BuyLink } from "@/app/BuyLink";
import { useWantList, type WantListItem } from "@/app/WantListContext";
import { cardHref, fmtAUD, fmtCents, plural, toSmallImage } from "@/lib/utils";
import { variantBadgeWithFoil } from "@/lib/variant-utils";
import { MAX_CARD_QTY } from "@/lib/config";
import { itemQty, type PlannedFlags, type StoreGroup } from "@/lib/optimiser/want-list";
import { EditablePostageRow } from "./EditablePostageRow";
import { useCardHover } from "./CardPreview";
import { PrintingPicker } from "./PrintingPicker";

/** What the last optimise changed about a card, as small warning chips. */
function Flags({ item, planned }: { item: WantListItem; planned: PlannedFlags }) {
  const chips: string[] = [];
  const f = planned.flags;
  if (f.printingChanged) chips.push("different printing");
  if (f.conditionChanged && !f.conditionUnknown) chips.push(`${planned.prevCondition ?? "?"} → ${item.condition}`);
  if (f.conditionUnknown) chips.push("condition not stated");
  if (f.stockUnconfirmed) chips.push(`stock for ${itemQty(item)} not confirmed`);
  return chips.map((c) => (
    <span key={c} className="rounded border border-amber-500/40 px-1.5 py-px text-[11px] text-amber-300">{c}</span>
  ));
}

/**
 * One card on the list, at the listing it's bought from. The controls edit what
 * the user wants (qty, printing mode); Optimise then finds where to buy it.
 */
function CardRow({ item, planned }: { item: WantListItem; planned?: PlannedFlags }) {
  const { updateItem, removeItem } = useWantList();
  const hover = useCardHover()(item.imageUri);
  const qty = itemQty(item);
  const badge = variantBadgeWithFoil(item);
  const thumb = toSmallImage(item.imageUri);

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
              <span className="sm:hidden">{item.setName}</span>
              {badge && <span className="text-accent-light">{badge}</span>}
              {item.condition && <span>{item.condition}</span>}
              {planned && <Flags item={item} planned={planned} />}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold text-price whitespace-nowrap">{fmtAUD(item.priceAud * qty)}</div>
            {qty > 1 && <div className="text-[11px] text-cream-dim whitespace-nowrap">{fmtAUD(item.priceAud)} each</div>}
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <PrintingPicker item={item} />

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
          {item.url && (
            <BuyLink
              href={item.url}
              storeId={item.storeId}
              card={item.cardName}
              price={item.priceAud}
              source="want-list"
              printingId={item.printingId}
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
 * `exact` says the postage comes from the optimiser rather than an estimate;
 * `planned` holds what the last optimise changed, by item id.
 */
export function StoreSection({
  store,
  planned,
  exact,
  onExclude,
}: {
  store: StoreGroup;
  planned: Map<string, PlannedFlags> | null;
  exact: boolean;
  onExclude: () => void;
}) {
  const { storeShippingOverrides, setStoreShipping } = useWantList();
  const [collapsed, setCollapsed] = useState(false);
  const copies = store.items.reduce((n, i) => n + itemQty(i), 0);

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
          {plural(copies, "card")}
          {" · "}<span className="font-semibold text-price">{exact ? "" : "~"}{fmtCents(store.subtotalCents + store.postageCents)}</span>
          <span className="ml-2 text-xs opacity-60" aria-hidden>{collapsed ? "▶" : "▼"}</span>
        </span>
      </button>

      {!collapsed && (
        <>
          <ul>
            {store.items.map((item) => <CardRow key={item.id} item={item} planned={planned?.get(item.id)} />)}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-subtle bg-cream-muted/50 px-3 py-2 rounded-b-lg text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-cream-dim">
              {store.kind === "per-item" ? (
                <span>Postage {fmtCents(store.postageCents)} (each listing ships separately)</span>
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
                <span>Spend {fmtCents(store.freeShippingGapCents)} more here for free postage</span>
              )}
            </div>
            <button onClick={onExclude} className="text-cream-dim hover:text-red-400 transition-colors">
              {store.kind === "per-item" ? `Don’t use ${store.storeName}` : "Don’t use this store"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
