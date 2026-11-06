// Client side of the want list: the bridge between its localStorage items and
// the optimiser's API. Pure, relative imports only, so vitest resolves it without
// path aliases.
//
// An item is a card the user wants (qty, printing mode) plus the listing it's
// bought from. Running the optimiser moves each item to its planned listing
// (`applyPlan`); until then it's the listing it was added at.

import { MAX_CARD_QTY } from "../config";
import { DEFAULT_PREFS, type Offer, type OptimiseLine, type OptimiseResponse, type PlanStore, type Prefs } from "./types";
import { wantListItemId, type WantListItem } from "../../app/WantListContext";

export function itemQty(item: Pick<WantListItem, "qty">): number {
  const q = item.qty ?? 1;
  return Number.isInteger(q) ? Math.min(Math.max(q, 1), MAX_CARD_QTY) : 1;
}

/** One engine line per want-list item, with its listing as the line's current one. */
export function toLines(items: WantListItem[]): OptimiseLine[] {
  return items.map((item) => ({
    lineId: item.id,
    cardId: item.cardId,
    cardName: item.cardName,
    qty: itemQty(item),
    printing: item.printingMode ?? "any",
    printingId: item.printingId,
    current: {
      printingId: item.printingId,
      storeId: item.storeId,
      condition: item.condition,
      url: item.url,
      seenCents: Math.round(item.priceAud * 100),
    },
  }));
}

/** The engine's prefs from the user's saved ones plus their per-store postage edits (AUD). */
export function requestPrefs(saved: SavedPrefs, postageOverridesAud: Record<string, number>): Prefs {
  return {
    ...saved,
    // eBay is one of the stores the user can untick, so it rides in excludeStores.
    includeEbay: true,
    postageOverrides: Object.fromEntries(
      Object.entries(postageOverridesAud).map(([storeId, aud]) => [storeId, Math.round(aud * 100)])),
  };
}

function itemToOffer(item: WantListItem): Offer {
  return {
    printingId: item.printingId,
    setName: item.setName,
    setCode: item.setCode,
    rarity: item.rarity,
    isFoil: item.isFoil,
    finish: item.finish ?? (item.isFoil ? "foil" : "nonfoil"),
    borderColor: item.borderColor ?? null,
    frameEffects: item.frameEffects ?? [],
    imageUri: item.imageUri,
    condition: item.condition,
    url: item.url,
    storeId: item.storeId,
    storeName: item.storeName,
    priceCents: Math.round(item.priceAud * 100),
    shippingCents: item.shippingAud === null ? null : Math.round(item.shippingAud * 100),
    stockQty: null,
    variantId: null,
  };
}

/**
 * The list grouped by the store each item is bought from, in the plan's shape.
 * Postage is an estimate: `flatCents` per store (the user's override, else the
 * store's flat rate; null = unknown, counted as 0), or each listing's own
 * postage for per-item stores (eBay). Free-shipping thresholds aren't applied —
 * only the optimiser's answer is exact.
 */
export function listStores(items: WantListItem[], flatCents: (storeId: string) => number | null): PlanStore[] {
  const stores = new Map<string, PlanStore>();
  for (const item of items) {
    const store = stores.get(item.storeId) ?? {
      storeId: item.storeId, storeName: item.storeName, kind: item.storeId === "ebay_au" ? "per-item" : "flat",
      units: [], subtotalCents: 0, postageCents: 0, postageWaived: false, freeShippingGapCents: null,
    };
    const qty = itemQty(item);
    const offer = itemToOffer(item);
    store.units.push({
      lineId: item.id, cardId: item.cardId, cardName: item.cardName, qty, offer,
      flags: { printingChanged: false, conditionChanged: false, conditionUnknown: false, stockUnconfirmed: false },
    });
    store.subtotalCents += qty * offer.priceCents;
    if (store.kind === "per-item") store.postageCents += qty * (offer.shippingCents ?? 0);
    stores.set(item.storeId, store);
  }
  for (const store of stores.values()) {
    if (store.kind === "flat") store.postageCents = flatCents(store.storeId) ?? 0;
  }
  return [...stores.values()];
}

function offerToItem(offer: Offer, from: WantListItem, qty: number): WantListItem {
  return {
    id: wantListItemId(offer.printingId, offer.storeId, offer.url),
    cardId: from.cardId,
    cardSlug: from.cardSlug,
    cardName: from.cardName,
    printingId: offer.printingId,
    setName: offer.setName,
    setCode: offer.setCode,
    rarity: offer.rarity,
    isFoil: offer.isFoil,
    finish: offer.finish,
    borderColor: offer.borderColor,
    frameEffects: offer.frameEffects,
    storeId: offer.storeId,
    storeName: offer.storeName,
    priceAud: offer.priceCents / 100,
    shippingAud: offer.shippingCents === null ? null : offer.shippingCents / 100,
    condition: offer.condition,
    url: offer.url,
    imageUri: offer.imageUri,
    qty,
    printingMode: from.printingMode,
  };
}

/**
 * The want list after buying the plan. Each item becomes the listings its copies
 * were planned at; copies the plan couldn't fill stay on the item as it was, so
 * the list still says how many the user wants. Items the plan doesn't cover are
 * kept unchanged, and order is preserved.
 */
export function applyPlan(items: WantListItem[], res: OptimiseResponse): WantListItem[] {
  const unitsByLine = new Map<string, { offer: Offer; qty: number }[]>();
  for (const unit of res.plan.stores.flatMap((s) => s.units)) {
    const units = unitsByLine.get(unit.lineId) ?? [];
    units.push(unit);
    unitsByLine.set(unit.lineId, units);
  }

  const out = new Map<string, WantListItem>();
  const add = (item: WantListItem): void => {
    const existing = out.get(item.id);
    out.set(item.id, existing ? { ...existing, qty: itemQty(existing) + itemQty(item) } : item);
  };
  for (const item of items) {
    const units = unitsByLine.get(item.id);
    if (!units) {
      add(item);
      continue;
    }
    let bought = 0;
    for (const u of units) {
      add(offerToItem(u.offer, item, u.qty));
      bought += u.qty;
    }
    if (bought < itemQty(item)) add({ ...item, qty: itemQty(item) - bought });
  }
  return [...out.values()];
}


/**
 * Prefs the user picks on the page. Postage overrides live with the want list
 * instead, and eBay is just another store in `excludeStores`.
 */
export type SavedPrefs = Omit<Prefs, "postageOverrides" | "includeEbay">;

export const PREFS_KEY = "scrymarket_optimiser_prefs";

const DEFAULT_SAVED: SavedPrefs = {
  minCondition: DEFAULT_PREFS.minCondition,
  finish: DEFAULT_PREFS.finish,
  excludeStores: [],
  maxStores: DEFAULT_PREFS.maxStores,
};

/** Reads saved prefs leniently: anything unrecognised falls back to its default. */
export function parseSavedPrefs(raw: string | null): SavedPrefs {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) v = parsed as Record<string, unknown>;
  } catch {
    // fall through to defaults
  }
  // Spelled out rather than imported: @mtg-au/shared's index pulls pino into the client bundle.
  const conditions: readonly unknown[] = ["NM", "LP", "MP", "HP", "DMG", "any"] satisfies SavedPrefs["minCondition"][];
  const finishes: readonly unknown[] = ["nonfoil", "foil", "etched", "any"];
  const excludeStores = Array.isArray(v.excludeStores)
    ? v.excludeStores.filter((s): s is string => typeof s === "string" && s !== "")
    : [];
  // Saved before eBay moved into the store list.
  if (v.includeEbay === false && !excludeStores.includes("ebay_au")) excludeStores.push("ebay_au");
  return {
    minCondition: conditions.includes(v.minCondition) ? v.minCondition as SavedPrefs["minCondition"] : DEFAULT_SAVED.minCondition,
    finish: finishes.includes(v.finish) ? v.finish as SavedPrefs["finish"] : DEFAULT_SAVED.finish,
    excludeStores,
    maxStores: Number.isInteger(v.maxStores) && (v.maxStores as number) >= 1 ? v.maxStores as number : null,
  };
}
