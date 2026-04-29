// Pure optimization algorithm — no Next.js or DB imports.
// Extracted so unit tests can import without path-alias resolution issues.

export type OptimizeItem = {
  cardId: string;
  cardName: string;
  printingId: string;
};

export type Listing = {
  printingId: string;
  storeId: string;
  storeName: string;
  priceAud: number;
  shippingAud: number | null;
  condition: string | null;
  url: string | null;
  setName: string;
  setCode: string;
  rarity: string;
  isFoil: boolean;
  imageUri: string | null;
};

export function evaluateSubset(
  items: OptimizeItem[],
  byCard: Map<string, Listing[]>,
  activePoolStoreIds: Set<string>,
  allPoolStoreIds: Set<string>,
  flatRates: Record<string, number | null>
): { cost: number; assignments: Map<string, Listing> } | null {
  const assignments = new Map<string, Listing>();

  for (const item of items) {
    const listings = byCard.get(item.cardId);
    if (!listings || listings.length === 0) return null;

    let best: Listing | null = null;
    let bestCost = Infinity;

    for (const l of listings) {
      if (allPoolStoreIds.has(l.storeId) && !activePoolStoreIds.has(l.storeId)) continue;

      const effectiveCost = activePoolStoreIds.has(l.storeId)
        ? l.priceAud
        : l.priceAud + (l.shippingAud ?? 0);

      const flatL = activePoolStoreIds.has(l.storeId) ? (flatRates[l.storeId] ?? 0) : 0;
      const flatBest = best && activePoolStoreIds.has(best.storeId) ? (flatRates[best.storeId] ?? 0) : 0;

      if (effectiveCost < bestCost || (effectiveCost === bestCost && flatL < flatBest)) {
        bestCost = effectiveCost;
        best = l;
      }
    }

    if (!best) return null;
    assignments.set(item.cardId, best);
  }

  const usedPoolStores = new Set<string>();
  let totalCost = 0;

  for (const listing of assignments.values()) {
    totalCost += listing.priceAud;
    if (activePoolStoreIds.has(listing.storeId)) {
      usedPoolStores.add(listing.storeId);
    } else {
      totalCost += listing.shippingAud ?? 0;
    }
  }

  for (const storeId of usedPoolStores) {
    const flat = flatRates[storeId];
    totalCost += flat ?? 0;
  }

  return { cost: totalCost, assignments };
}

export function branchAndBound(
  stores: string[],
  idx: number,
  active: Set<string>,
  available: OptimizeItem[],
  byCard: Map<string, Listing[]>,
  allPoolStoreIds: Set<string>,
  flatRates: Record<string, number | null>,
  best: { cost: number; assignments: Map<string, Listing> | null }
): void {
  const optimisticActive = new Set(active);
  const optimisticRates: Record<string, number | null> = { ...flatRates };
  for (let i = idx; i < stores.length; i++) {
    optimisticActive.add(stores[i]);
    optimisticRates[stores[i]] = 0;
  }
  const lb = evaluateSubset(available, byCard, optimisticActive, allPoolStoreIds, optimisticRates);
  if (!lb || lb.cost >= best.cost) return;

  if (idx === stores.length) {
    best.cost = lb.cost;
    best.assignments = lb.assignments;
    return;
  }

  const storeId = stores[idx];

  active.add(storeId);
  branchAndBound(stores, idx + 1, active, available, byCard, allPoolStoreIds, flatRates, best);
  active.delete(storeId);

  branchAndBound(stores, idx + 1, active, available, byCard, allPoolStoreIds, flatRates, best);
}
