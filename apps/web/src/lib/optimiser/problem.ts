// Turns a request (lines + prefs) and the listings the route fetched into the
// indexed form the search works on. Everything that decides *which* listings a
// line may use lives here, so the search never has to know about prefs.

import { isKnownCondition } from "@mtg-au/shared";
import { mapListingRow, type StoreListingRow } from "../store-listing";
import { toCents, type Cents, type OptimiseLine, type Offer, type Prefs, type StoreInfo, type Unavailable } from "./types";

export { toCents };

export type OfferRow = StoreListingRow & { card_id: string; stock_qty: number | null; variant_id: string | null };

export function offerFromRow(row: OfferRow): Offer {
  const { priceAud, shippingAud, ...listing } = mapListingRow(row);
  return {
    ...listing,
    priceCents: toCents(row.price_aud),
    shippingCents: row.shipping_aud ? toCents(row.shipping_aud) : null,
    stockQty: row.stock_qty,
    variantId: row.variant_id,
  };
}

export type ProblemLine = {
  line: OptimiseLine;
  /**
   * Offer indexes this line may use, cheapest unit cost first, trimmed per store
   * to what can ever be bought (see trimPerStore).
   */
  cands: number[];
  /** Index of the user's current listing among the offers, or -1 (none, or not eligible). */
  current: number;
};

export type Problem = {
  lines: ProblemLine[];
  offers: Offer[];
  /** Cents per copy: price, plus per-item postage for per-item stores. */
  unitCost: Cents[];
  /** Index into `stores` for each offer. */
  offerStore: number[];
  stores: StoreInfo[];
  /** Flat postage after the user's overrides; null for per-item stores. */
  flat: (Cents | null)[];
  /** Store indexes the search opens and closes: flat-rate stores with a usable offer. */
  pool: number[];
  unavailable: Unavailable[];
};

/** A listing with no condition, or one outside NM–DMG ("Signed"), can't be ruled out, so it passes. */
export function meetsCondition(condition: string | null, prefs: Prefs): boolean {
  if (condition === null || !isKnownCondition(condition)) return true;
  return prefs.conditions.includes(condition);
}

export function isEligible(offer: Offer, line: OptimiseLine, prefs: Prefs): boolean {
  if (prefs.excludeStores.includes(offer.storeId)) return false;
  if (!meetsCondition(offer.condition, prefs)) return false;
  return line.printing === "any" || offer.printingId === line.printingId;
}

export function sameListing(offer: Offer, key: NonNullable<OptimiseLine["current"]>): boolean {
  return offer.printingId === key.printingId && offer.storeId === key.storeId
    && offer.condition === key.condition && offer.url === key.url;
}

/**
 * Within one store, a line only ever buys from that store's cheapest offers, so
 * keep offers until their stock covers the line's qty. An offer with unknown
 * stock covers everything. v1 kept exactly one per store; with stock caps the
 * second-cheapest copy can be needed.
 */
function trimPerStore(cands: number[], qty: number, p: Pick<Problem, "offers" | "offerStore">): number[] {
  const covered = new Map<number, number>();
  return cands.filter((i) => {
    const s = p.offerStore[i];
    const have = covered.get(s) ?? 0;
    if (have >= qty) return false;
    covered.set(s, have + (p.offers[i].stockQty ?? qty));
    return true;
  });
}

/**
 * `offersByCard` is every in-stock listing for the requested cards, eligible or
 * not — the current plan is re-priced from it too, and a user's current listing
 * may sit at a store their prefs now exclude.
 */
export function buildProblem(
  lines: OptimiseLine[],
  offersByCard: Map<string, Offer[]>,
  storeList: StoreInfo[],
  prefs: Prefs,
): Problem {
  const stores = storeList;
  const storeIndex = new Map(stores.map((s, i) => [s.storeId, i]));
  const flat = stores.map((s) =>
    s.flatCents === null ? null : (prefs.postageOverrides[s.storeId] ?? s.flatCents));

  const offers: Offer[] = [];
  const offerIndex = new Map<Offer, number>();
  const offerStore: number[] = [];
  const unitCost: Cents[] = [];
  const indexOf = (o: Offer): number => {
    let i = offerIndex.get(o);
    if (i === undefined) {
      i = offers.length;
      offers.push(o);
      offerIndex.set(o, i);
      const s = storeIndex.get(o.storeId)!;
      offerStore.push(s);
      unitCost.push(o.priceCents + (flat[s] === null ? (o.shippingCents ?? 0) : 0));
    }
    return i;
  };

  const problemLines: ProblemLine[] = [];
  const unavailable: Unavailable[] = [];
  for (const line of lines) {
    const all = (offersByCard.get(line.cardId) ?? []).filter((o) => storeIndex.has(o.storeId));
    const eligible = all.filter((o) => isEligible(o, line, prefs));
    if (eligible.length === 0) {
      const reason = all.length === 0 ? "no-listings" : "no-match";
      unavailable.push({ lineId: line.lineId, cardId: line.cardId, cardName: line.cardName, reason, missing: line.qty });
      continue;
    }
    // Cheapest first. Equal costs prefer what the user already has — their
    // listing, then their printing — so a re-run never swaps for nothing; then
    // the cheaper flat rate, which is what v1 tie-broke on.
    const rank = (o: Offer): number =>
      line.current && sameListing(o, line.current) ? 0 : o.printingId === line.printingId ? 1 : 2;
    const cands = eligible.map(indexOf).sort((a, b) =>
      unitCost[a] - unitCost[b]
      || rank(offers[a]) - rank(offers[b])
      || (flat[offerStore[a]] ?? 0) - (flat[offerStore[b]] ?? 0));
    const current = line.current ? cands.find((i) => sameListing(offers[i], line.current!)) ?? -1 : -1;
    problemLines.push({ line, cands: trimPerStore(cands, line.qty, { offers, offerStore }), current });
  }

  const usable = new Set(problemLines.flatMap((l) => l.cands.map((i) => offerStore[i])));
  // Cheapest flat rate first: the search's seeds and branch order both lean on it.
  const pool = [...usable]
    .filter((s) => flat[s] !== null)
    .sort((a, b) => flat[a]! - flat[b]! || stores[a].storeId.localeCompare(stores[b].storeId));

  return { lines: problemLines, offers, unitCost, offerStore, stores, flat, pool, unavailable };
}
