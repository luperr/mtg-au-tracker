// Client side of the want list: the bridge between its localStorage items and
// the optimiser's API. Pure, relative imports only, so vitest resolves it without
// path aliases.
//
// An item is a card the user wants (qty, printing mode) plus the listing it was
// added at. The page shows the optimiser's plan, not that listing; the listing
// stays as the baseline the plan's savings are measured against.

import { MAX_CARD_QTY } from "../config";
import { DEFAULT_PREFS, type Offer, type OptimiseLine, type PlanStore, type Prefs } from "./types";
import type { WantListItem } from "../../app/WantListContext";

export function itemQty(item: Pick<WantListItem, "qty">): number {
  const q = item.qty ?? 1;
  return Number.isInteger(q) ? Math.min(Math.max(q, 1), MAX_CARD_QTY) : 1;
}

/** One engine line per want-list item, with the listing it was added at as the line's current one. */
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
 * The list grouped by the store each card was added from, in the plan's shape,
 * for the moment before the first plan arrives (or if it fails). Postage is
 * unknown here, so it is left at zero and the page doesn't show it.
 */
export function baselineStores(items: WantListItem[]): PlanStore[] {
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
    stores.set(item.storeId, store);
  }
  return [...stores.values()];
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
