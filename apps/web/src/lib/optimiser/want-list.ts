// Client side of the want list: the bridge between its localStorage items and
// the optimiser's API. Pure, relative imports only, so vitest resolves it without
// path aliases.
//
// An item is a card the user wants (qty, printing mode) plus the listing it's
// bought from. Running the optimiser moves each item to its planned listing
// (`applyPlan`); until then it's the listing it was added at.

import { MAX_CARD_QTY } from "../config";
import {
  DEFAULT_PREFS, toCents, type Cents, type Offer, type OptimiseLine, type OptimiseResponse, type PlanUnit, type Prefs,
  type UnitFlags,
} from "./types";
import { toWantListItem, type WantListItem } from "../../app/WantListContext";

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
      seenCents: toCents(item.priceAud),
    },
  }));
}

/** Prefs the user picks on the page; postage overrides live with the want list instead. */
export type SavedPrefs = Omit<Prefs, "postageOverrides">;

/** The engine's prefs from the user's saved ones plus their per-store postage edits (AUD). */
export function requestPrefs(saved: SavedPrefs, postageOverridesAud: Record<string, number>): Prefs {
  return {
    ...saved,
    postageOverrides: Object.fromEntries(
      Object.entries(postageOverridesAud).map(([storeId, aud]) => [storeId, toCents(aud)])),
  };
}

/** The items bought from one store, as the page shows them. */
export type StoreGroup = {
  storeId: string;
  storeName: string;
  /** "per-item": each listing ships separately (eBay). */
  kind: "flat" | "per-item";
  items: WantListItem[];
  subtotalCents: Cents;
  postageCents: Cents;
  postageWaived: boolean;
  freeShippingGapCents: Cents | null;
};

/**
 * The list grouped by the store each item is bought from. `flatCents` is a
 * store's flat postage (the user's override, else its rate); null means postage
 * is per item, the same rule the optimiser uses. Until Optimise runs this is an
 * estimate — no free-shipping thresholds — and the page swaps in the plan's
 * exact postage when it has one.
 */
export function listStores(items: WantListItem[], flatCents: (storeId: string) => Cents | null): StoreGroup[] {
  const stores = new Map<string, StoreGroup>();
  for (const item of items) {
    let store = stores.get(item.storeId);
    if (!store) {
      const flat = flatCents(item.storeId);
      store = {
        storeId: item.storeId, storeName: item.storeName, kind: flat === null ? "per-item" : "flat", items: [],
        subtotalCents: 0, postageCents: flat ?? 0, postageWaived: false, freeShippingGapCents: null,
      };
      stores.set(item.storeId, store);
    }
    const qty = itemQty(item);
    store.items.push(item);
    store.subtotalCents += qty * toCents(item.priceAud);
    if (store.kind === "per-item") store.postageCents += qty * toCents(item.shippingAud ?? 0);
  }
  return [...stores.values()];
}

/** What the last optimise changed about an item, keyed by the item it produced. */
export type PlannedFlags = { flags: UnitFlags; prevCondition: string | null };

function offerToItem(offer: Offer, from: WantListItem, qty: number): WantListItem {
  const { priceCents, shippingCents, stockQty, variantId, ...listing } = offer;
  return toWantListItem(
    { ...listing, priceAud: priceCents / 100, shippingAud: shippingCents === null ? null : shippingCents / 100 },
    from,
    { printingMode: from.printingMode ?? "any", qty },
  );
}

/**
 * The want list after buying the plan. Each item becomes the listings its copies
 * were planned at; copies the plan couldn't fill stay on the item as it was, so
 * the list still says how many the user wants. Items the plan doesn't cover are
 * kept unchanged, and order is preserved. `flags` says what changed for each
 * item the plan produced; where two lines land on one listing, theirs combine.
 */
export function applyPlan(items: WantListItem[], res: OptimiseResponse): { items: WantListItem[]; flags: Map<string, PlannedFlags> } {
  const unitsByLine = new Map<string, PlanUnit[]>();
  for (const unit of res.plan.stores.flatMap((s) => s.units)) {
    const units = unitsByLine.get(unit.lineId) ?? [];
    units.push(unit);
    unitsByLine.set(unit.lineId, units);
  }

  const out = new Map<string, WantListItem>();
  const flags = new Map<string, PlannedFlags>();
  const add = (item: WantListItem, planned?: PlannedFlags): void => {
    const existing = out.get(item.id);
    out.set(item.id, existing ? { ...existing, qty: itemQty(existing) + itemQty(item) } : item);
    if (!planned) return;
    const had = flags.get(item.id);
    flags.set(item.id, had ? {
      flags: {
        printingChanged: had.flags.printingChanged || planned.flags.printingChanged,
        conditionChanged: had.flags.conditionChanged || planned.flags.conditionChanged,
        conditionUnknown: had.flags.conditionUnknown || planned.flags.conditionUnknown,
        stockUnconfirmed: had.flags.stockUnconfirmed || planned.flags.stockUnconfirmed,
      },
      prevCondition: had.prevCondition,
    } : planned);
  };
  for (const item of items) {
    const units = unitsByLine.get(item.id);
    if (!units) {
      add(item);
      continue;
    }
    let bought = 0;
    for (const u of units) {
      add(offerToItem(u.offer, item, u.qty), { flags: u.flags, prevCondition: item.condition });
      bought += u.qty;
    }
    if (bought < itemQty(item)) add({ ...item, qty: itemQty(item) - bought });
  }
  return { items: [...out.values()], flags };
}

export const PREFS_KEY = "scrymarket_optimiser_prefs";

/**
 * NM to DMG, best first. Spelled out so this module adds no runtime import of
 * @mtg-au/shared, whose index carries the pino logger.
 */
export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const satisfies readonly SavedPrefs["conditions"][number][];

/** Reads saved prefs leniently: anything unrecognised falls back to its default. */
export function parseSavedPrefs(raw: string | null): SavedPrefs {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) v = parsed as Record<string, unknown>;
  } catch {
    // fall through to defaults
  }
  const conditions = Array.isArray(v.conditions)
    ? CONDITIONS.filter((c) => (v.conditions as unknown[]).includes(c))
    : [];
  return {
    conditions: conditions.length > 0 ? conditions : [...DEFAULT_PREFS.conditions],
    excludeStores: Array.isArray(v.excludeStores)
      ? v.excludeStores.filter((s): s is string => typeof s === "string" && s !== "")
      : [],
    maxStores: Number.isInteger(v.maxStores) && (v.maxStores as number) >= 1 ? v.maxStores as number : null,
  };
}
