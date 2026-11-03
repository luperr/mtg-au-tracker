// Builders shared by the optimiser tests. Not a test file itself.

import { buildProblem, type Problem } from "./problem";
import { DEFAULT_PREFS, type Offer, type OptimiseLine, type Prefs, type StoreInfo } from "./types";

export function offer(storeId: string, priceCents: number, o: Partial<Offer> = {}): Offer {
  return {
    printingId: "p1",
    setName: "Test Set",
    setCode: "tst",
    rarity: "common",
    isFoil: false,
    finish: "nonfoil",
    borderColor: null,
    frameEffects: [],
    imageUri: null,
    condition: "NM",
    url: `https://${storeId}/${o.printingId ?? "p1"}/${priceCents}`,
    storeId,
    storeName: storeId,
    priceCents,
    shippingCents: null,
    stockQty: null,
    variantId: null,
    ...o,
  };
}

export function store(storeId: string, flatCents: number | null, freeOverCents: number | null = null): StoreInfo {
  return { storeId, storeName: storeId, flatCents, freeOverCents };
}

export function line(cardId: string, o: Partial<OptimiseLine> = {}): OptimiseLine {
  return { lineId: cardId, cardId, cardName: cardId, qty: 1, printing: "any", printingId: "p1", ...o };
}

export const prefs = (o: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, minCondition: "any", finish: "any", ...o });

export function problem(
  lines: OptimiseLine[],
  offersByCard: Record<string, Offer[]>,
  stores: StoreInfo[],
  p: Prefs = prefs(),
): Problem {
  return buildProblem(lines, new Map(Object.entries(offersByCard)), stores, p);
}

/** Deterministic LCG, as v1's tests use. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export type RandomInstance = {
  lines: OptimiseLine[];
  offersByCard: Record<string, Offer[]>;
  stores: StoreInfo[];
};

/**
 * `nStores` flat-rate stores ($0–$9 postage) plus eBay, and `nCards` cards each
 * listed at a random subset of them with random qty, stock and condition.
 */
export function randomInstance(
  rng: () => number,
  nStores: number,
  nCards: number,
  o: { thresholds?: boolean; stock?: boolean; maxQty?: number } = {},
): RandomInstance {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
  const stores: StoreInfo[] = Array.from({ length: nStores }, (_, i) =>
    store(`s${i}`, Math.round(rng() * 9) * 100, o.thresholds && rng() < 0.5 ? (5 + Math.round(rng() * 20)) * 100 : null));
  stores.push(store("ebay_au", null));

  const lines: OptimiseLine[] = [];
  const offersByCard: Record<string, Offer[]> = {};
  for (let c = 0; c < nCards; c++) {
    const cardId = `card-${c}`;
    lines.push(line(cardId, { qty: 1 + Math.floor(rng() * (o.maxQty ?? 1)) }));
    const offers: Offer[] = [];
    for (const s of stores) {
      if (rng() < 0.45) continue;
      const perItem = s.flatCents === null;
      offers.push(offer(s.storeId, 50 + Math.round(rng() * 2000), {
        printingId: pick(["p1", "p2"]),
        condition: pick(["NM", "NM", "LP", "MP", null]),
        shippingCents: perItem ? Math.round(rng() * 500) : null,
        stockQty: o.stock ? pick([1, 2, 3, null]) : null,
      }));
    }
    offersByCard[cardId] = offers;
  }
  return { lines, offersByCard, stores };
}
