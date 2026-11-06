import { describe, it, expect } from "vitest";
import { buildResponse, repriceCurrent } from "./plan";
import { alternatives, solve } from "./search";
import { isEligible } from "./problem";
import type { Offer, OptimiseLine, Prefs, StoreInfo } from "./types";
import { line, makeRng, offer, prefs, problem, randomInstance, store } from "./test-fixtures";

const opts = { maxOpen: Infinity, deadline: Infinity, exactMaxStores: 18 };

function run(lines: OptimiseLine[], offersByCard: Record<string, Offer[]>, stores: StoreInfo[], p: Prefs = prefs()) {
  const prob = problem(lines, offersByCard, stores, p);
  const result = solve(prob, { ...opts, maxOpen: p.maxStores ?? Infinity });
  const alts = alternatives(prob, result.best, opts);
  return {
    prob,
    result,
    res: buildResponse({ lines, offersByCard: new Map(Object.entries(offersByCard)), prefs: p, problem: prob, result, alternatives: alts }),
  };
}

describe("buildResponse invariants", () => {
  const cases: [string, Partial<Prefs>, Parameters<typeof randomInstance>[3]][] = [
    ["defaults", {}, { maxQty: 4, stock: true }],
    ["NM floor, no eBay", { minCondition: "NM", includeEbay: false }, { maxQty: 3, stock: true }],
    ["store cap", { maxStores: 2 }, { maxQty: 2, thresholds: true }],
    ["thresholds and overrides", { postageOverrides: { s1: 0 } }, { maxQty: 3, thresholds: true, stock: true }],
  ];

  it.each(cases)("hold on random lists: %s", (_, prefOverrides, instOpts) => {
    for (const seed of [1, 9, 23, 2026]) {
      const inst = randomInstance(makeRng(seed), 10, 25, instOpts);
      const p = prefs(prefOverrides);
      const { prob, result, res } = run(inst.lines, inst.offersByCard, inst.stores, p);
      const { plan } = res;
      const units = plan.stores.flatMap((s) => s.units);

      // Totals are the sum of their parts, in whole cents, and match what the search optimised.
      for (const s of plan.stores) {
        expect(s.subtotalCents).toBe(s.units.reduce((sum, u) => sum + u.qty * u.offer.priceCents, 0));
      }
      expect(plan.totals.cardsCents).toBe(plan.stores.reduce((sum, s) => sum + s.subtotalCents, 0));
      expect(plan.totals.totalCents).toBe(plan.totals.cardsCents + plan.totals.postageCents);
      expect(Number.isInteger(plan.totals.totalCents)).toBe(true);
      expect(plan.totals.totalCents).toBe(result.best.cents);

      // Every copy is one the prefs allow.
      const storeById = new Map(inst.stores.map((s) => [s.storeId, s]));
      const lineById = new Map(inst.lines.map((l) => [l.lineId, l]));
      for (const u of units) {
        expect(isEligible(u.offer, lineById.get(u.lineId)!, storeById.get(u.offer.storeId)!, p)).toBe(true);
      }

      // Each line gets its qty, less what's reported unavailable.
      for (const l of inst.lines) {
        const bought = units.filter((u) => u.lineId === l.lineId).reduce((sum, u) => sum + u.qty, 0);
        const missing = res.unavailable.find((x) => x.lineId === l.lineId)?.missing ?? 0;
        expect(bought + missing).toBe(l.qty);
      }
      expect(plan.totals.unitsFilled + res.unavailable.reduce((sum, x) => sum + x.missing, 0)).toBe(plan.totals.unitsWanted);

      // No listing sold past its stock.
      const sold = new Map<Offer, number>();
      for (const u of units) sold.set(u.offer, (sold.get(u.offer) ?? 0) + u.qty);
      for (const [o, n] of sold) if (o.stockQty !== null) expect(n).toBeLessThanOrEqual(o.stockQty);

      if (p.maxStores !== null) expect(plan.totals.storeCount).toBeLessThanOrEqual(p.maxStores);
      expect(res.proven).toBe(true);
      expect(prob.pool.length).toBeGreaterThan(0);
    }
  });
});

describe("buildResponse", () => {
  const stores = [store("a", 500, 2000), store("b", 0), store("ebay_au", null)];

  it("reports the free-postage gap until the threshold is met", () => {
    const { res } = run([line("c1")], { c1: [offer("a", 1200)] }, stores);
    expect(res.plan.stores[0]).toMatchObject({ postageCents: 500, postageWaived: false, freeShippingGapCents: 800 });

    const met = run([line("c1", { qty: 2 })], { c1: [offer("a", 1000)] }, stores).res;
    expect(met.plan.stores[0]).toMatchObject({ postageCents: 0, postageWaived: true, freeShippingGapCents: null });
  });

  it("counts each eBay listing as its own parcel", () => {
    const { res } = run(
      [line("c1"), line("c2"), line("c3")],
      {
        c1: [offer("ebay_au", 100, { url: "e1", shippingCents: 0 })],
        c2: [offer("ebay_au", 100, { url: "e2", shippingCents: 0 })],
        c3: [offer("b", 100)],
      },
      stores,
    );
    expect(res.plan.totals).toMatchObject({ storeCount: 1, parcelCount: 3 });
    expect(res.plan.stores.map((s) => s.kind)).toEqual(["flat", "per-item"]);
  });

  it("flags changed printings, changed and unknown conditions, and unconfirmed stock", () => {
    const current = { ...offer("b", 900), seenCents: 900 };
    const { res } = run(
      [line("c1", { qty: 2, current })],
      { c1: [offer("b", 900), offer("b", 100, { printingId: "p2", condition: null })] },
      stores,
    );
    expect(res.plan.stores[0].units[0].flags).toEqual({
      printingChanged: true, conditionChanged: true, conditionUnknown: true, stockUnconfirmed: true,
    });
  });

  it("re-prices the current listings and reports savings only like for like", () => {
    const listing = offer("b", 400);
    const lines = [
      line("c1", { current: { ...listing, seenCents: 300 } }),
      line("c2", { current: { ...offer("b", 100, { url: "sold-out" }), seenCents: 100 } }),
    ];
    const offersByCard = { c1: [listing, offer("ebay_au", 100, { shippingCents: 0 })], c2: [offer("b", 200)] };
    const { res } = run(lines, offersByCard, stores);

    expect(res.current.repriced).toEqual([{ lineId: "c1", seenCents: 300, nowCents: 400 }]);
    expect(res.current.missing).toEqual(["c2"]);
    expect(res.savingsCents).toBeNull();

    const whole = run([lines[0]], offersByCard, stores).res;
    expect(whole.current.totals.totalCents).toBe(400);
    expect(whole.plan.totals.totalCents).toBe(100);
    expect(whole.savingsCents).toBe(300);
  });

  it("re-prices a current listing at a store the prefs exclude", () => {
    const listing = offer("a", 1000);
    const lines = [line("c1", { current: { ...listing, seenCents: 1000 } })];
    const current = repriceCurrent(lines, new Map([["c1", [listing]]]), stores, prefs({ excludeStores: ["a"] }));
    expect(current).toMatchObject({ missing: [], totals: { totalCents: 1500 } });
  });

  it("has no savings figure when the plan can't fill every copy", () => {
    const listing = offer("b", 100, { stockQty: 1 });
    const { res } = run([line("c1", { qty: 2, current: { ...listing, seenCents: 100 } })], { c1: [listing] }, stores);
    expect(res.unavailable).toEqual([{ lineId: "c1", cardId: "c1", cardName: "c1", reason: "short", missing: 1 }]);
    expect(res.savingsCents).toBeNull();
  });

  it("names the stores in each alternative", () => {
    const { res } = run(
      [line("c1"), line("c2")],
      { c1: [offer("a", 100), offer("b", 3000)], c2: [offer("a", 3000), offer("b", 100)] },
      [store("a", 300), store("b", 300)],
    );
    expect(res.plan.totals.storeCount).toBe(2);
    expect(res.alternatives).toEqual([{ storeCount: 1, totalCents: 3400, storeIds: ["a"] }]);
  });
});
