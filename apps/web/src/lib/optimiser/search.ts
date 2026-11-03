// The search over which flat-rate stores to buy from. Same shape as v1's
// (app/api/optimize/algorithm.ts): seeds → local search → exact branch and bound
// under a deadline. What changed is what one evaluation means — quantities,
// stock caps, free-shipping thresholds, a cap on open stores — and that it is
// all integer cents.
//
// Known limits, both deliberate:
//  - With free-shipping thresholds, evaluate() buys each copy at its cheapest open
//    listing and then waives postage where a subtotal clears its threshold. It
//    does not move copies to a dearer store to reach one, so a plan can miss a
//    waiver it could have earned; the plan reports that gap instead.
//  - Two lines can share a listing's stock (same card, overlapping eligibility).
//    They draw from it in line order, and the bound is then no longer strictly
//    admissible. It needs two lines for one card *and* a store publishing stock.

import type { Cents } from "./types";
import type { Problem } from "./problem";

/** An unfilled copy costs $1M, so the search maximises copies filled before cost. */
const UNFILLED_PENALTY: Cents = 100_000_000;
/** Larger than any line count, so `tie` orders by stores used, then lines changed. */
const TIE_SCALE = 1024;

export type Evaluation = {
  /** What the search minimises: cents plus the unfilled penalty. */
  cost: number;
  /**
   * Breaks equal costs: fewer flat-rate stores, then fewer lines moved off the
   * listing the user already has, so a re-run never swaps for nothing. 0 in a bound.
   */
  tie: number;
  /** Cards + postage, excluding the unfilled penalty. */
  cents: Cents;
  unfilled: number;
  /** Flat-rate stores used. */
  storesUsed: number;
  /** Per line, `[offerIndex, qty, offerIndex, qty, …]`. Only when asked for. */
  alloc: number[][] | null;
};

export const better = (a: Evaluation, b: Evaluation): boolean =>
  a.cost < b.cost || (a.cost === b.cost && a.tie < b.tie);

/** Lower-bound mode for branch and bound. */
type Bound = {
  /** Store index → position in `pool`, -1 for stores not in it. */
  pos: Int32Array;
  /** Pool positions at or after this are undecided. */
  fromIdx: number;
  /** Treat undecided stores as open. False once the store cap is reached. */
  suffixOpen: boolean;
};

/** Reusable per-problem scratch, so evaluation allocates nothing per call. */
export type Scratch = { taken: Int32Array; subtotal: Float64Array; used: Uint8Array; touched: number[] };

export function makeScratch(p: Problem): Scratch {
  return {
    taken: new Int32Array(p.offers.length),
    subtotal: new Float64Array(p.stores.length),
    used: new Uint8Array(p.stores.length),
    touched: [],
  };
}

/**
 * Cost a set of open flat-rate stores (`open[storeIndex] === 1`; per-item
 * stores are always open). Each line buys its copies from its cheapest open
 * listings, up to their stock; postage is added once per flat-rate store used
 * and waived when that store's subtotal reaches its threshold.
 *
 * In bound mode the cost is a lower bound for every completion of a partial
 * decision: undecided stores count as open, and both they and any store with a
 * threshold cost $0 postage, since a completion might clear it.
 */
export function evaluate(p: Problem, sc: Scratch, open: Uint8Array, bound: Bound | null, record: boolean): Evaluation {
  const { taken, subtotal, used, touched } = sc;
  const alloc: number[][] | null = record ? [] : null;
  const takenOffers: number[] = [];
  let cents = 0;
  let unfilled = 0;
  let changed = 0;

  for (const { line, cands, current } of p.lines) {
    let need = line.qty;
    let moved = false;
    const mine: number[] | null = record ? [] : null;
    for (let k = 0; k < cands.length && need > 0; k++) {
      const i = cands[k];
      const s = p.offerStore[i];
      const isOpen = p.flat[s] === null || open[s] === 1
        || (bound !== null && bound.suffixOpen && bound.pos[s] >= bound.fromIdx);
      if (!isOpen) continue;
      const stock = p.offers[i].stockQty;
      const n = stock === null ? need : Math.min(need, stock - taken[i]);
      if (n <= 0) continue;
      if (stock !== null) {
        if (taken[i] === 0) takenOffers.push(i);
        taken[i] += n;
      }
      need -= n;
      if (i !== current) moved = true;
      cents += n * p.unitCost[i];
      if (!used[s]) { used[s] = 1; touched.push(s); }
      subtotal[s] += n * p.offers[i].priceCents;
      mine?.push(i, n);
    }
    unfilled += need;
    if (moved) changed++;
    alloc?.push(mine!);
  }

  let storesUsed = 0;
  for (const s of touched) {
    const flat = p.flat[s];
    if (flat !== null) {
      storesUsed++;
      const freeOver = p.stores[s].freeOverCents;
      const waived = bound !== null
        ? open[s] !== 1 || freeOver !== null
        : freeOver !== null && subtotal[s] >= freeOver;
      if (!waived) cents += flat;
    }
    used[s] = 0;
    subtotal[s] = 0;
  }
  touched.length = 0;
  for (const i of takenOffers) taken[i] = 0;

  const tie = bound === null ? storesUsed * TIE_SCALE + changed : 0;
  return { cost: cents + unfilled * UNFILLED_PENALTY, tie, cents, unfilled, storesUsed, alloc };
}

export type SolveResult = {
  best: Evaluation & { alloc: number[][] };
  /** Store indexes the best plan actually buys from (flat-rate only). */
  open: number[];
  /** Whether branch and bound ran, and whether it finished (the plan is provably optimal). */
  exact: boolean;
  completed: boolean;
};

export type SolveOptions = {
  /** Most flat-rate stores to open. Infinity = no cap. */
  maxOpen: number;
  /** Epoch ms. Local search and branch and bound both stop once passed. */
  deadline: number;
  /** Branch and bound runs when the subsets to search number at most 2^this. */
  exactMaxStores: number;
};

function toSet(p: Problem, stores: Iterable<number>): Uint8Array {
  const open = new Uint8Array(p.stores.length);
  for (const s of stores) open[s] = 1;
  return open;
}

/** Flat-rate stores an allocation buys from. */
function usedStores(p: Problem, alloc: number[][]): number[] {
  const out = new Set<number>();
  for (const pairs of alloc) {
    for (let k = 0; k < pairs.length; k += 2) {
      const s = p.offerStore[pairs[k]];
      if (p.flat[s] !== null) out.add(s);
    }
  }
  return [...out];
}

/** Number of pool subsets with at most `k` stores, capped once it passes `cap`. */
function subsetCount(n: number, k: number, cap: number): number {
  let total = 0;
  let c = 1; // C(n, 0)
  for (let i = 0; i <= Math.min(n, k); i++) {
    total += c;
    if (total > cap) return total;
    c = (c * (n - i)) / (i + 1);
  }
  return total;
}

/**
 * Best-improvement local search over the open set: open, close or swap one
 * store, while any move gives a better plan (see `better`) and the open count
 * stays within `maxOpen`. Each pass strictly improves, so it terminates.
 */
function localSearch(p: Problem, sc: Scratch, start: number[], opts: SolveOptions): { open: number[]; ev: Evaluation } {
  let active = new Set(start);
  let current = evaluate(p, sc, toSet(p, active), null, false);

  for (let pass = 0; pass < 2 * p.pool.length + 1 && Date.now() <= opts.deadline; pass++) {
    let bestNext: Set<number> | null = null;
    let bestEv = current;
    const tryMove = (next: Set<number>): void => {
      if (Date.now() > opts.deadline) return;
      const ev = evaluate(p, sc, toSet(p, next), null, false);
      if (better(ev, bestEv)) { bestEv = ev; bestNext = next; }
    };
    if (active.size < opts.maxOpen) {
      for (const s of p.pool) if (!active.has(s)) tryMove(new Set(active).add(s));
    }
    for (const s of active) {
      const next = new Set(active);
      next.delete(s);
      tryMove(next);
    }
    for (const a of active) {
      for (const b of p.pool) {
        if (active.has(b)) continue;
        const next = new Set(active);
        next.delete(a);
        tryMove(next.add(b));
      }
    }
    if (!bestNext) break;
    active = bestNext;
    current = bestEv;
  }
  return { open: [...active], ev: current };
}

/**
 * Exact search over subsets of the pool, cheapest flat rate first, pruning on
 * the evaluate() lower bound. Leaves are re-costed for real, since the bound
 * waives every threshold. Returns false if the deadline cut it short.
 */
function branchAndBound(
  p: Problem,
  sc: Scratch,
  opts: SolveOptions,
  pos: Int32Array,
  incumbent: { ev: Evaluation; open: number[] },
  open: Uint8Array,
  idx: number,
  openCount: number,
): boolean {
  if (Date.now() > opts.deadline) return false;
  const full = openCount >= opts.maxOpen;
  const lb = evaluate(p, sc, open, { pos, fromIdx: idx, suffixOpen: !full }, false);
  if (!better(lb, incumbent.ev)) return true;

  if (idx === p.pool.length || full) {
    const ev = evaluate(p, sc, open, null, false);
    if (better(ev, incumbent.ev)) {
      incumbent.ev = ev;
      incumbent.open = p.pool.filter((s) => open[s] === 1);
    }
    return true;
  }

  const s = p.pool[idx];
  open[s] = 1;
  const withStore = branchAndBound(p, sc, opts, pos, incumbent, open, idx + 1, openCount + 1);
  open[s] = 0;
  const withoutStore = branchAndBound(p, sc, opts, pos, incumbent, open, idx + 1, openCount);
  return withStore && withoutStore;
}

export function solve(p: Problem, opts: SolveOptions, sc: Scratch = makeScratch(p)): SolveResult {
  // Seeds: no flat-rate store (eBay only), then each store alone.
  const seeds: number[][] = [[], ...(opts.maxOpen >= 1 ? p.pool.map((s) => [s]) : [])];
  let incumbent = { ev: evaluate(p, sc, toSet(p, []), null, false), open: [] as number[] };
  for (const seed of seeds.slice(1)) {
    const ev = evaluate(p, sc, toSet(p, seed), null, false);
    if (better(ev, incumbent.ev)) incumbent = { ev, open: seed };
  }

  const ls = localSearch(p, sc, incumbent.open, opts);
  if (better(ls.ev, incumbent.ev)) incumbent = ls;

  const cap = 2 ** opts.exactMaxStores;
  const exact = subsetCount(p.pool.length, opts.maxOpen, cap) <= cap;
  let completed = false;
  if (exact) {
    const pos = new Int32Array(p.stores.length).fill(-1);
    p.pool.forEach((s, i) => { pos[s] = i; });
    completed = branchAndBound(p, sc, opts, pos, incumbent, new Uint8Array(p.stores.length), 0, 0);
  }

  const best = evaluate(p, sc, toSet(p, incumbent.open), null, true) as SolveResult["best"];
  return { best, open: usedStores(p, best.alloc), exact, completed: exact && completed };
}

/**
 * The cheapest plan for each smaller store count — the "1 store $171 · 2 stores
 * $152" choices. Only counts that fill as many copies as `best` and use exactly
 * that many stores; a cap of 3 that the search fills with 2 is the 2-store plan.
 */
export function alternatives(
  p: Problem,
  best: Evaluation,
  opts: Omit<SolveOptions, "maxOpen">,
  maxCount = 5,
): { storeCount: number; cents: Cents; open: number[] }[] {
  const sc = makeScratch(p);
  const out: { storeCount: number; cents: Cents; open: number[] }[] = [];
  for (let k = 1; k < Math.min(best.storesUsed, maxCount + 1); k++) {
    if (Date.now() > opts.deadline) break;
    const r = solve(p, { ...opts, maxOpen: k }, sc);
    if (r.best.unfilled === best.unfilled && r.best.storesUsed === k) {
      out.push({ storeCount: k, cents: r.best.cents, open: r.open });
    }
  }
  return out;
}
