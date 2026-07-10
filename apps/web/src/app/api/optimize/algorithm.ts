// Pure optimization algorithm — no Next.js or DB imports.
// Extracted so unit tests can import without path-alias resolution issues.
//
// The optimiser solves an Uncapacitated Facility Location Problem: which subset
// of flat-rate stores minimises total cost (cards + postage)? The pipeline is:
//   1. Warm-start seeds (eBay-only + each single store)      — route.ts
//   2. localSearch() open/close/swap refinement               — near-optimal, ms
//   3. branchAndBound() exact prove-or-improve pass           — bounded by deadline

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
  finish: "nonfoil" | "foil" | "etched";
  borderColor: string | null;
  frameEffects: string[];
  imageUri: string | null;
};

/**
 * Cost a specific subset of open pool stores: assign each card to its cheapest
 * permitted listing, then add flat postage once per used pool store.
 *
 * `suffixOpen` supports the branch-and-bound lower bound without per-node
 * allocations: stores whose rank is >= fromIdx (the still-undecided stores)
 * are treated as open with a $0 flat fee, on top of `activePoolStoreIds`.
 * That optimistic costing makes the bound admissible — it never exceeds the
 * true cost of the best solution in the subtree.
 */
export function evaluateSubset(
  items: OptimizeItem[],
  byCard: Map<string, Listing[]>,
  activePoolStoreIds: Set<string>,
  allPoolStoreIds: Set<string>,
  flatRates: Record<string, number | null>,
  suffixOpen?: { rank: Map<string, number>; fromIdx: number },
): { cost: number; assignments: Map<string, Listing> } | null {
  const isOpen = (storeId: string): boolean =>
    activePoolStoreIds.has(storeId) ||
    (suffixOpen !== undefined && (suffixOpen.rank.get(storeId) ?? -1) >= suffixOpen.fromIdx);
  // Suffix-open stores are costed at $0 flat (optimistic); decided-open stores
  // pay their real rate.
  const flatRateOf = (storeId: string): number =>
    activePoolStoreIds.has(storeId) ? (flatRates[storeId] ?? 0) : 0;

  const assignments = new Map<string, Listing>();

  for (const item of items) {
    const listings = byCard.get(item.cardId);
    if (!listings || listings.length === 0) return null;

    let best: Listing | null = null;
    let bestCost = Infinity;

    for (const l of listings) {
      const isPool = allPoolStoreIds.has(l.storeId);
      if (isPool && !isOpen(l.storeId)) continue;

      const effectiveCost = isPool ? l.priceAud : l.priceAud + (l.shippingAud ?? 0);

      const flatL = isPool ? flatRateOf(l.storeId) : 0;
      const flatBest = best && allPoolStoreIds.has(best.storeId) ? flatRateOf(best.storeId) : 0;

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
    if (isOpen(listing.storeId)) {
      usedPoolStores.add(listing.storeId);
      totalCost += listing.priceAud;
    } else {
      totalCost += listing.priceAud + (listing.shippingAud ?? 0);
    }
  }

  for (const storeId of usedPoolStores) {
    totalCost += flatRateOf(storeId);
  }

  return { cost: totalCost, assignments };
}

// ── Listing dedupe ────────────────────────────────────────────────────────────

/**
 * Keep only the first listing per store for one card. Within a store, only the
 * cheapest listing can ever be part of an optimal assignment (the flat fee is
 * identical for every listing from that store), so the rest are dead weight —
 * a broad want list can otherwise carry tens of thousands of listings into
 * every subset evaluation.
 *
 * Assumes the input is already sorted the way route.ts sorts it (cheapest
 * first, current printing breaking ties), so "first per store" preserves both
 * the price optimum and the current-printing tie-break.
 */
export function dedupeCheapestPerStore(listings: Listing[]): Listing[] {
  const seen = new Set<string>();
  const out: Listing[] = [];
  for (const l of listings) {
    if (seen.has(l.storeId)) continue;
    seen.add(l.storeId);
    out.push(l);
  }
  return out;
}

// ── Local search ──────────────────────────────────────────────────────────────

export type LocalSearchResult = {
  cost: number;
  assignments: Map<string, Listing>;
  active: Set<string>;
};

/**
 * Best-improvement local search over the open-store subset. From the starting
 * set, repeatedly applies the best of all single-store moves — open one, close
 * one, or swap one for another — until no move lowers the cost.
 *
 * Cost strictly decreases each pass, so termination is guaranteed; the pass cap
 * is belt-and-braces. O(N²) evaluateSubset calls per pass — milliseconds at
 * realistic sizes, and near-optimal in practice for facility-location problems.
 * Used to warm-start branchAndBound with a tight upper bound.
 *
 * `deadline` (epoch ms) stops move exploration once passed; the best solution
 * found so far is returned. The initial evaluation always runs, so a feasible
 * start yields a valid (if unrefined) result even with an expired deadline.
 */
export function localSearch(
  items: OptimizeItem[],
  byCard: Map<string, Listing[]>,
  initialActive: Set<string>,
  candidateStores: string[],
  allPoolStoreIds: Set<string>,
  flatRates: Record<string, number | null>,
  deadline: number = Infinity,
): LocalSearchResult | null {
  let active = new Set(initialActive);
  let current = evaluateSubset(items, byCard, active, allPoolStoreIds, flatRates);
  if (!current) {
    // Starting set can't cover every card (e.g. empty set with pool-only
    // listings) — fall back to all candidates open and let close-moves trim.
    active = new Set(candidateStores);
    current = evaluateSubset(items, byCard, active, allPoolStoreIds, flatRates);
    if (!current) return null;
  }

  const maxPasses = 2 * candidateStores.length + 1;
  for (let pass = 0; pass < maxPasses && Date.now() <= deadline; pass++) {
    let bestMoveCost = current.cost;
    let bestMoveActive: Set<string> | null = null;
    let bestMoveResult: { cost: number; assignments: Map<string, Listing> } | null = null;

    const tryMove = (next: Set<string>): void => {
      if (Date.now() > deadline) return;
      const r = evaluateSubset(items, byCard, next, allPoolStoreIds, flatRates);
      if (r && r.cost < bestMoveCost) {
        bestMoveCost = r.cost;
        bestMoveActive = next;
        bestMoveResult = r;
      }
    };

    for (const s of candidateStores) {
      if (active.has(s)) continue;
      tryMove(new Set(active).add(s));
    }
    for (const s of active) {
      const next = new Set(active);
      next.delete(s);
      tryMove(next);
    }
    for (const a of active) {
      for (const b of candidateStores) {
        if (active.has(b)) continue;
        const next = new Set(active);
        next.delete(a);
        next.add(b);
        tryMove(next);
      }
    }

    if (!bestMoveActive || !bestMoveResult) break; // local optimum (or deadline)
    active = bestMoveActive;
    current = bestMoveResult;
  }

  return { cost: current.cost, assignments: current.assignments, active };
}

// ── Branch and bound ──────────────────────────────────────────────────────────

export type BranchAndBoundContext = {
  /** Pool stores to branch on, sorted cheapest flat rate first. */
  stores: string[];
  available: OptimizeItem[];
  byCard: Map<string, Listing[]>;
  allPoolStoreIds: Set<string>;
  flatRates: Record<string, number | null>;
  /** Incumbent solution — updated in place whenever a better leaf is found. */
  best: { cost: number; assignments: Map<string, Listing> | null };
  /** Epoch ms; the search stops exploring once passed. Infinity = no limit. */
  deadline: number;
  /** storeId → index in `stores`; drives the suffix-open lower bound. */
  rank: Map<string, number>;
};

/**
 * Exact search over subsets of pool stores — worst case O(2^N) nodes, each doing
 * an O(items × listings) bound evaluation. The caller warm-starts `ctx.best`
 * (single-store seeds + localSearch), so this is a prove-or-improve pass: for
 * small N it completes and the result is provably optimal; for large N the
 * deadline cuts it off and the warm-started incumbent stands.
 *
 * The lower bound treats every undecided store (stores[idx..]) as open at a $0
 * flat fee via evaluateSubset's suffixOpen param — admissible, so pruning never
 * discards the true optimum, and allocation-free per node.
 *
 * Returns true if the subtree was fully explored (result provably optimal),
 * false if the deadline cut it short. `ctx.best.assignments` is normally
 * non-null even after a cutoff (warm-start seeds run first), but callers must
 * still handle null — every seed can be infeasible in adversarial inventory.
 */
export function branchAndBound(
  ctx: BranchAndBoundContext,
  idx: number,
  active: Set<string>,
): boolean {
  if (Date.now() > ctx.deadline) return false;

  const lb = evaluateSubset(
    ctx.available, ctx.byCard, active, ctx.allPoolStoreIds, ctx.flatRates,
    { rank: ctx.rank, fromIdx: idx },
  );
  if (!lb || lb.cost >= ctx.best.cost) return true; // pruned — subtree resolved

  if (idx === ctx.stores.length) {
    ctx.best.cost = lb.cost;
    ctx.best.assignments = lb.assignments;
    return true;
  }

  const storeId = ctx.stores[idx];

  active.add(storeId);
  const withStore = branchAndBound(ctx, idx + 1, active);
  active.delete(storeId);
  const withoutStore = branchAndBound(ctx, idx + 1, active);

  return withStore && withoutStore;
}
