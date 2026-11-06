// Turns a search result into the response: the plan grouped by store, the
// user's current listings re-priced with the same cost rules, and the savings
// between them only when that comparison is like for like.
//
// v1's "save $X" compared localStorage prices from whenever a card was added,
// costed with the client's postage rule, against live prices costed with the
// server's. Both sides here are today's prices through one function.

import { isKnownCondition } from "@mtg-au/shared";
import { sameListing, type Problem } from "./problem";
import type { SolveResult } from "./search";
import type {
  Cents, CurrentPlan, Offer, OptimiseLine, OptimiseResponse, Plan, PlanStore, PlanUnit, Prefs, StoreInfo,
  Unavailable,
} from "./types";

type Purchase = { line: OptimiseLine; offer: Offer; qty: number };

function flags(line: OptimiseLine, offer: Offer, qty: number): PlanUnit["flags"] {
  return {
    printingChanged: line.printingId !== null && offer.printingId !== line.printingId,
    conditionChanged: line.current != null && offer.condition !== line.current.condition,
    conditionUnknown: offer.condition === null || !isKnownCondition(offer.condition),
    stockUnconfirmed: offer.stockQty === null && qty > 1,
  };
}

/**
 * Groups purchases by store and costs them: flat postage once per store, waived
 * at the store's threshold; per-item postage per copy. The search's evaluate()
 * applies the same rules, and the tests hold the two to the same total.
 */
export function assemblePlan(purchases: Purchase[], stores: StoreInfo[], prefs: Prefs, unitsWanted: number): Plan {
  const byId = new Map(stores.map((s) => [s.storeId, s]));
  const groups = new Map<string, PlanUnit[]>();
  for (const { line, offer, qty } of purchases) {
    const units = groups.get(offer.storeId) ?? [];
    units.push({ lineId: line.lineId, cardId: line.cardId, cardName: line.cardName, qty, offer, flags: flags(line, offer, qty) });
    groups.set(offer.storeId, units);
  }

  const planStores: PlanStore[] = [...groups].map(([storeId, units]) => {
    const store = byId.get(storeId)!;
    const subtotalCents = units.reduce((sum, u) => sum + u.qty * u.offer.priceCents, 0);
    if (store.flatCents === null) {
      return {
        storeId, storeName: store.storeName, kind: "per-item", units, subtotalCents,
        postageCents: units.reduce((sum, u) => sum + u.qty * (u.offer.shippingCents ?? 0), 0),
        postageWaived: false, freeShippingGapCents: null,
      };
    }
    const flat = prefs.postageOverrides[storeId] ?? store.flatCents;
    const freeOver = store.freeOverCents;
    const postageWaived = freeOver !== null && flat > 0 && subtotalCents >= freeOver;
    return {
      storeId, storeName: store.storeName, kind: "flat", units, subtotalCents,
      postageCents: postageWaived ? 0 : flat,
      postageWaived,
      freeShippingGapCents: freeOver !== null && flat > 0 && !postageWaived ? freeOver - subtotalCents : null,
    };
  });
  // Biggest order first; eBay's listings last, since each is its own seller.
  planStores.sort((a, b) =>
    (a.kind === "per-item" ? 1 : 0) - (b.kind === "per-item" ? 1 : 0) || b.subtotalCents - a.subtotalCents);

  const cardsCents = planStores.reduce((sum, s) => sum + s.subtotalCents, 0);
  const postageCents = planStores.reduce((sum, s) => sum + s.postageCents, 0);
  const flatStores = planStores.filter((s) => s.kind === "flat").length;
  const perItemParcels = new Set(planStores
    .filter((s) => s.kind === "per-item")
    .flatMap((s) => s.units.map((u) => u.offer.url ?? `${u.offer.storeId}:${u.offer.printingId}`))).size;

  return {
    stores: planStores,
    totals: {
      cardsCents,
      postageCents,
      totalCents: cardsCents + postageCents,
      storeCount: flatStores,
      parcelCount: flatStores + perItemParcels,
      unitsWanted,
      unitsFilled: purchases.reduce((sum, p) => sum + p.qty, 0),
    },
  };
}

/** The user's chosen listings at today's prices. Prefs don't apply: this is what they have. */
export function repriceCurrent(
  lines: OptimiseLine[],
  offersByCard: Map<string, Offer[]>,
  stores: StoreInfo[],
  prefs: Prefs,
): CurrentPlan {
  const purchases: Purchase[] = [];
  const missing: string[] = [];
  const repriced: CurrentPlan["repriced"] = [];
  for (const line of lines) {
    const current = line.current;
    const offer = current ? offersByCard.get(line.cardId)?.find((o) => sameListing(o, current)) : undefined;
    if (!current || !offer) {
      missing.push(line.lineId);
      continue;
    }
    purchases.push({ line, offer, qty: line.qty });
    if (offer.priceCents !== current.seenCents) {
      repriced.push({ lineId: line.lineId, seenCents: current.seenCents, nowCents: offer.priceCents });
    }
  }
  const unitsWanted = lines.reduce((sum, l) => sum + l.qty, 0);
  return { totals: assemblePlan(purchases, stores, prefs, unitsWanted).totals, missing, repriced };
}

export function buildResponse(args: {
  lines: OptimiseLine[];
  offersByCard: Map<string, Offer[]>;
  prefs: Prefs;
  problem: Problem;
  result: SolveResult;
  alternatives: { storeCount: number; cents: Cents; open: number[] }[];
}): OptimiseResponse {
  const { lines, offersByCard, prefs, problem: p, result, alternatives } = args;

  const purchases: Purchase[] = [];
  const unavailable: Unavailable[] = [...p.unavailable];
  p.lines.forEach(({ line }, li) => {
    const pairs = result.best.alloc[li];
    let filled = 0;
    for (let k = 0; k < pairs.length; k += 2) {
      purchases.push({ line, offer: p.offers[pairs[k]], qty: pairs[k + 1] });
      filled += pairs[k + 1];
    }
    if (filled < line.qty) {
      unavailable.push({ lineId: line.lineId, cardId: line.cardId, cardName: line.cardName, reason: "short", missing: line.qty - filled });
    }
  });

  const unitsWanted = lines.reduce((sum, l) => sum + l.qty, 0);
  const plan = assemblePlan(purchases, p.stores, prefs, unitsWanted);
  const current = repriceCurrent(lines, offersByCard, p.stores, prefs);
  const comparable = current.missing.length === 0 && plan.totals.unitsFilled === unitsWanted;

  return {
    plan,
    alternatives: alternatives.map((a) => ({
      storeCount: a.storeCount,
      totalCents: a.cents,
      storeIds: a.open.map((s) => p.stores[s].storeId),
    })),
    current,
    savingsCents: comparable ? current.totals.totalCents - plan.totals.totalCents : null,
    unavailable,
    proven: result.completed,
  };
}
