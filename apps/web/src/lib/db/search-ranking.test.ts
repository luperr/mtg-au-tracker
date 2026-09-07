/**
 * Integration guards for the ranked search. These need a real database with real card
 * data, so they are opt-in: set INTEGRATION_DATABASE_URL to run them. Without it the
 * whole file skips, which is why CI stays green with no Postgres.
 *
 *   INTEGRATION_DATABASE_URL=postgresql://mtg:changeme@db:5432/mtg_tracker \
 *     docker compose run --rm scraper pnpm test search-ranking
 *
 * The root vitest config always sets a dummy DATABASE_URL (lib/db throws at import
 * time without one), so the real URL is swapped in before the dynamic import below.
 */
import { describe, it, expect, beforeAll } from "vitest";

const TEST_DB = process.env.INTEGRATION_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

describeDb("searchCards ranking", () => {
  let searchCards: typeof import("./cards.js").searchCards;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    ({ searchCards } = await import("./cards.js"));
  });

  it("ranks an exact name match first", async () => {
    const { results, fuzzy } = await searchCards("lightning bolt");
    expect(results[0]?.name).toBe("Lightning Bolt");
    expect(fuzzy).toBe(false);
  });

  it("ranks a prefix match above a mid-word match", async () => {
    const { results } = await searchCards("bolt");
    const prefix = results.findIndex((c) => c.name.toLowerCase().startsWith("bolt"));
    const midWord = results.findIndex((c) => !c.name.toLowerCase().startsWith("bolt"));
    expect(prefix).toBeGreaterThanOrEqual(0);
    if (midWord >= 0) expect(prefix).toBeLessThan(midWord);
  });

  /**
   * The reason the query uses word_similarity (<%) and not similarity (%).
   * similarity('bolt', 'Lightning Bolt') is 0.33 — within a rounding error of the 0.3
   * default cutoff — while word_similarity normalises against the best-matching word
   * and scores it 1.0. Swapping the operator back would make this fail.
   */
  it("recovers a card from a one-character typo, via the fuzzy pass", async () => {
    const { results, fuzzy } = await searchCards("lightnig bolt");
    expect(fuzzy).toBe(true);
    expect(results.map((c) => c.name)).toContain("Lightning Bolt");
  });

  it("does not return junk for a query that is too damaged to match", async () => {
    const { results, fuzzy } = await searchCards("llghtnig bilt");
    expect(results).toHaveLength(0);
    expect(fuzzy).toBe(false);
  });

  it("never runs the fuzzy pass when the literal pass found something", async () => {
    const { results, fuzzy } = await searchCards("counterspell");
    expect(fuzzy).toBe(false);
    expect(results[0]?.name).toBe("Counterspell");
  });

  it("refuses queries below the minimum length rather than seq-scanning", async () => {
    const { results, totalCount } = await searchCards("so");
    expect(results).toHaveLength(0);
    expect(totalCount).toBe(0);
  });

  /**
   * The candidate cap is applied to an *ordered* set. If it were not, the 2,000 rows
   * kept would differ between the request for page 1 and the request for page 2, and
   * infinite scroll would duplicate and drop cards.
   */
  it("pages a capped query without duplicating or dropping rows", async () => {
    const seen = new Set<string>();
    let total = 0;
    for (let offset = 0; offset < 100; offset += 20) {
      const { results } = await searchCards("the", offset);
      for (const card of results) seen.add(card.id);
      total += results.length;
    }
    expect(total).toBe(100);
    expect(seen.size).toBe(100);
  });

  it("reports a capped total as a floor", async () => {
    const { totalCount, capped } = await searchCards("the");
    expect(capped).toBe(true);
    expect(totalCount).toBe(2000);
  });
});
