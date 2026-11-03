import { describe, it, expect } from "vitest";
import { alternatives, evaluate, makeScratch, solve, type SolveOptions } from "./search";
import type { Problem } from "./problem";
import { line, makeRng, offer, problem, randomInstance, store } from "./test-fixtures";

const exactOpts: SolveOptions = { maxOpen: Infinity, deadline: Infinity, exactMaxStores: 18 };

function openSet(p: Problem, ids: string[]): Uint8Array {
  const open = new Uint8Array(p.stores.length);
  for (const id of ids) open[p.stores.findIndex((s) => s.storeId === id)] = 1;
  return open;
}

const ev = (p: Problem, ids: string[]) => evaluate(p, makeScratch(p), openSet(p, ids), null, true);
const storeIds = (p: Problem, open: number[]) => open.map((s) => p.stores[s].storeId).sort();

/**
 * The cheapest way to buy every line, by trying every split of every line's qty
 * across its listings. Ignores the open-set search entirely, so it checks
 * evaluate()'s greedy fill and the search together. Distinct cards only: lines
 * sharing stock aren't modelled here.
 */
function bruteForce(p: Problem): { unfilled: number; cents: number } {
  let best = { unfilled: Infinity, cents: Infinity };
  const counts = p.lines.map((l) => new Array<number>(l.cands.length).fill(0));

  const finish = (): void => {
    let cents = 0;
    let unfilled = 0;
    const used = new Map<number, number>();
    p.lines.forEach((l, li) => {
      let filled = 0;
      l.cands.forEach((i, k) => {
        const n = counts[li][k];
        if (n === 0) return;
        filled += n;
        cents += n * p.unitCost[i];
        const s = p.offerStore[i];
        used.set(s, (used.get(s) ?? 0) + n * p.offers[i].priceCents);
      });
      unfilled += l.line.qty - filled;
    });
    for (const [s, subtotal] of used) {
      const flat = p.flat[s];
      const freeOver = p.stores[s].freeOverCents;
      if (flat !== null && !(freeOver !== null && subtotal >= freeOver)) cents += flat;
    }
    if (unfilled < best.unfilled || (unfilled === best.unfilled && cents < best.cents)) best = { unfilled, cents };
  };

  const walk = (li: number, k: number, left: number): void => {
    if (li === p.lines.length) return finish();
    const l = p.lines[li];
    if (k === l.cands.length) return walk(li + 1, 0, p.lines[li + 1]?.line.qty ?? 0);
    const stock = p.offers[l.cands[k]].stockQty ?? left;
    for (let n = 0; n <= Math.min(left, stock); n++) {
      counts[li][k] = n;
      walk(li, k + 1, left - n);
    }
    counts[li][k] = 0;
  };
  walk(0, 0, p.lines[0]?.line.qty ?? 0);
  return best;
}

describe("evaluate", () => {
  const stores = [store("a", 500), store("b", 700, 3000), store("ebay_au", null)];

  it("charges flat postage once per store and per-item postage per copy", () => {
    const p = problem(
      [line("c1", { qty: 2 }), line("c2")],
      { c1: [offer("ebay_au", 100, { shippingCents: 250 })], c2: [offer("a", 300)] },
      stores,
    );
    expect(ev(p, ["a"])).toMatchObject({ cents: 2 * (100 + 250) + 300 + 500, unfilled: 0, storesUsed: 1 });
  });

  it("waives postage once a store's subtotal reaches its threshold", () => {
    const lines = [line("c1", { qty: 2 })];
    expect(ev(problem(lines, { c1: [offer("b", 1400)] }, stores), ["b"]).cents).toBe(2800 + 700);
    expect(ev(problem(lines, { c1: [offer("b", 1500)] }, stores), ["b"]).cents).toBe(3000);
  });

  it("fills past a listing's stock from the next cheapest, and counts what's left over", () => {
    const p = problem(
      [line("c1", { qty: 4 })],
      { c1: [offer("a", 100, { stockQty: 1 }), offer("a", 150, { stockQty: 1 }), offer("ebay_au", 200, { stockQty: 1, shippingCents: 0 })] },
      stores,
    );
    expect(ev(p, ["a"])).toMatchObject({ cents: 100 + 150 + 200 + 500, unfilled: 1 });
    expect(ev(p, ["a"]).alloc).toEqual([[0, 1, 1, 1, 2, 1]]);
  });

  it("shares stock between lines for the same card", () => {
    const shared = offer("a", 100, { stockQty: 2 });
    const p = problem([line("c1", { lineId: "x", qty: 2 }), line("c1", { lineId: "y", qty: 2 })], { c1: [shared] }, stores);
    expect(ev(p, ["a"])).toMatchObject({ unfilled: 2, cents: 200 + 500 });
  });

  it("as a bound, treats undecided stores as open and every threshold as met", () => {
    const p = problem([line("c1")], { c1: [offer("a", 100), offer("b", 50)] }, stores);
    const sc = makeScratch(p);
    const pos = new Int32Array(p.stores.length).fill(-1);
    p.pool.forEach((s, i) => { pos[s] = i; });
    // a decided open, b undecided: b's copy at $0 postage.
    expect(evaluate(p, sc, openSet(p, ["a"]), { pos, fromIdx: 1, suffixOpen: true }, false).cents).toBe(50);
    // b decided open, but it has a threshold: still $0 postage.
    expect(evaluate(p, sc, openSet(p, ["b"]), { pos, fromIdx: 2, suffixOpen: true }, false).cents).toBe(50);
    // Store cap reached: undecided stores stay shut.
    expect(evaluate(p, sc, openSet(p, ["a"]), { pos, fromIdx: 1, suffixOpen: false }, false).cents).toBe(600);
  });
});

describe("solve", () => {
  it("splits across stores when that beats any single store", () => {
    const p = problem(
      [line("c1"), line("c2")],
      { c1: [offer("a", 100), offer("b", 2000)], c2: [offer("a", 2000), offer("b", 100)] },
      [store("a", 300), store("b", 300)],
    );
    const r = solve(p, exactOpts);
    expect(storeIds(p, r.open)).toEqual(["a", "b"]);
    expect(r.best.cents).toBe(800);
    expect(r.completed).toBe(true);
  });

  it("respects a store cap", () => {
    const p = problem(
      [line("c1"), line("c2")],
      { c1: [offer("a", 100), offer("b", 2000)], c2: [offer("a", 2000), offer("b", 100)] },
      [store("a", 300), store("b", 400)],
    );
    const r = solve(p, { ...exactOpts, maxOpen: 1 });
    expect(r.open).toHaveLength(1);
    expect(r.best.cents).toBe(2100 + 300);
  });

  it("prefers fewer stores between plans of equal cost", () => {
    // {a} and {a, b} both cost $10: b's copy saves exactly its postage.
    const p = problem(
      [line("c1"), line("c2")],
      { c1: [offer("a", 500)], c2: [offer("a", 400), offer("b", 200)] },
      [store("a", 100), store("b", 200)],
    );
    const r = solve(p, exactOpts);
    expect(r.best.cents).toBe(1000);
    expect(storeIds(p, r.open)).toEqual(["a"]);
  });

  it("keeps the current listing when nothing is cheaper", () => {
    const current = { ...offer("b", 300, { printingId: "p2" }), seenCents: 300 };
    const p = problem(
      [line("c1", { current })],
      { c1: [offer("a", 300), offer("b", 300, { printingId: "p2" })] },
      [store("a", 500), store("b", 500)],
    );
    const r = solve(p, exactOpts);
    expect(p.offers[r.best.alloc[0][0]].storeId).toBe("b");
  });

  it("buys from eBay alone when that is cheapest", () => {
    const p = problem(
      [line("c1")],
      { c1: [offer("a", 100), offer("ebay_au", 150, { shippingCents: 100 })] },
      [store("a", 900), store("ebay_au", null)],
    );
    expect(solve(p, exactOpts)).toMatchObject({ open: [], best: { cents: 250, storesUsed: 0 } });
  });

  it("matches a brute force over every allocation (qty, stock, conditions)", () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
      const inst = randomInstance(makeRng(seed), 4, 3, { stock: true, maxQty: 3 });
      const p = problem(inst.lines, inst.offersByCard, inst.stores);
      const r = solve(p, exactOpts);
      expect(r.completed).toBe(true);
      expect({ unfilled: r.best.unfilled, cents: r.best.cents }).toEqual(bruteForce(p));
    }
  });

  it("never reports a plan cheaper than the true optimum with thresholds", () => {
    // Thresholds aren't solved exactly (see search.ts), but a plan below the
    // brute-force optimum would mean the costing itself is wrong.
    for (const seed of [3, 11, 58]) {
      const inst = randomInstance(makeRng(seed), 4, 3, { thresholds: true, stock: true, maxQty: 2 });
      const p = problem(inst.lines, inst.offersByCard, inst.stores);
      const r = solve(p, exactOpts).best;
      const truth = bruteForce(p);
      expect(r.unfilled).toBe(truth.unfilled);
      expect(r.cents).toBeGreaterThanOrEqual(truth.cents);
    }
  });

  it("is never worse with thresholds than the plan that ignores them", () => {
    for (const seed of [5, 17, 31, 64]) {
      const inst = randomInstance(makeRng(seed), 8, 12, { thresholds: true, maxQty: 3 });
      const withThresholds = problem(inst.lines, inst.offersByCard, inst.stores);
      const without = problem(inst.lines, inst.offersByCard, inst.stores.map((s) => ({ ...s, freeOverCents: null })));
      const blind = solve(without, exactOpts);
      const ignoringCost = evaluate(withThresholds, makeScratch(withThresholds),
        openSet(withThresholds, blind.open.map((s) => without.stores[s].storeId)), null, false);
      expect(solve(withThresholds, exactOpts).best.cents).toBeLessThanOrEqual(ignoringCost.cents);
    }
  });

  it("stays fast and valid at scale without the exact pass (30 stores × 80 lines)", () => {
    const inst = randomInstance(makeRng(8), 30, 80, { maxQty: 4, stock: true });
    const p = problem(inst.lines, inst.offersByCard, inst.stores);
    const started = Date.now();
    const r = solve(p, { ...exactOpts, deadline: Date.now() + 1500 });
    expect(r.exact).toBe(false);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(r.best.cents).toBeLessThanOrEqual(ev(p, inst.stores.map((s) => s.storeId)).cents);
  });
});

describe("alternatives", () => {
  it("offers the cheapest plan for each smaller store count", () => {
    for (const seed of [2, 13, 77]) {
      const inst = randomInstance(makeRng(seed), 8, 15, { maxQty: 2 });
      const p = problem(inst.lines, inst.offersByCard, inst.stores);
      const best = solve(p, exactOpts).best;
      const alts = alternatives(p, best, { deadline: Infinity, exactMaxStores: 18 });

      let prev = Infinity;
      for (const a of alts) {
        expect(a.open).toHaveLength(a.storeCount);
        expect(a.storeCount).toBeLessThan(best.storesUsed);
        expect(a.cents).toBeGreaterThanOrEqual(best.cents);
        // More stores allowed never costs more.
        expect(a.cents).toBeLessThanOrEqual(prev);
        // Each matches the capped search on its own.
        expect(a.cents).toBe(solve(p, { ...exactOpts, maxOpen: a.storeCount }).best.cents);
        prev = a.cents;
      }
    }
  });

  it("is empty when the best plan already uses one store", () => {
    const p = problem([line("c1")], { c1: [offer("a", 100)] }, [store("a", 500)]);
    expect(alternatives(p, solve(p, exactOpts).best, { deadline: Infinity, exactMaxStores: 18 })).toEqual([]);
  });
});
