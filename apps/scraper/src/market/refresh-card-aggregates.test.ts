/**
 * Integration guards for the denormalised card-row aggregates. They assert the
 * invariant that matters: every materialised column still equals what a live query
 * over printings / store_prices would return. A drift here is invisible in the UI —
 * search just quietly shows wrong prices — so it is worth checking directly.
 *
 * Opt-in, like the search ranking tests: needs a real database with real data.
 *
 *   INTEGRATION_DATABASE_URL=postgresql://mtg:changeme@db:5432/mtg_tracker \
 *     docker compose run --rm scraper pnpm test refresh-card-aggregates
 */
import { describe, it, expect, beforeAll } from "vitest";

const TEST_DB = process.env.INTEGRATION_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

describeDb("card aggregates", () => {
  let db: typeof import("../lib/db.js").db;
  let sql: typeof import("drizzle-orm").sql;
  let refreshCardAggregates: typeof import("./refresh-card-aggregates.js").refreshCardAggregates;

  const count = async (query: ReturnType<typeof import("drizzle-orm").sql>) => {
    const rows = (await db.execute(query)) as unknown as Array<{ n: string | number }>;
    return Number(rows[0]?.n ?? -1);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    ({ sql } = await import("drizzle-orm"));
    ({ db } = await import("../lib/db.js"));
    ({ refreshCardAggregates } = await import("./refresh-card-aggregates.js"));
    // Both passes are full recomputes, so this is safe to run against dev data and
    // leaves the columns in the state the assertions below expect.
    await refreshCardAggregates();
  });

  it("stores a printing_count matching the real count", async () => {
    const wrong = await count(sql`
      SELECT COUNT(*) AS n FROM cards c
      WHERE c.printing_count <> (SELECT COUNT(*) FROM printings p WHERE p.card_id = c.id)
    `);
    expect(wrong).toBe(0);
  });

  it("stores a cheapest price matching the cheapest in-stock sell listing", async () => {
    const wrong = await count(sql`
      SELECT COUNT(*) AS n FROM cards c
      WHERE c.cheapest_price_aud IS DISTINCT FROM (
        SELECT MIN(sp.price_aud::numeric)
        FROM store_prices sp
        JOIN printings p ON p.id = sp.printing_id
        WHERE p.card_id = c.id AND sp.price_type = 'sell' AND sp.in_stock = true
      )
    `);
    expect(wrong).toBe(0);
  });

  /**
   * The regression that matters most. The "out of stock → null the price" cleanup used
   * to live inside the paused market-stats pass, which is why cards nobody stocks kept
   * showing a price and a working add-to-want-list button.
   */
  it("nulls the price of a card no store has in stock", async () => {
    const stale = await count(sql`
      SELECT COUNT(*) AS n FROM cards c
      WHERE c.cheapest_price_aud IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM store_prices sp
          JOIN printings p ON p.id = sp.printing_id
          WHERE p.card_id = c.id AND sp.price_type = 'sell' AND sp.in_stock = true
        )
    `);
    expect(stale).toBe(0);
  });

  it("counts distinct stores, not listings", async () => {
    const wrong = await count(sql`
      SELECT COUNT(*) AS n FROM cards c
      WHERE c.in_stock_store_count <> (
        SELECT COUNT(DISTINCT sp.store_id)
        FROM store_prices sp
        JOIN printings p ON p.id = sp.printing_id
        WHERE p.card_id = c.id AND sp.price_type = 'sell' AND sp.in_stock = true
      )
    `);
    expect(wrong).toBe(0);
  });

  it("tags every set and rarity a card has been printed in", async () => {
    const missing = await count(sql`
      SELECT COUNT(*) AS n FROM (
        SELECT p.card_id, 'set:' || lower(p.set_code) AS tag FROM printings p
        UNION
        SELECT p.card_id, 'rarity:' || lower(p.rarity) FROM printings p
      ) expected
      JOIN cards c ON c.id = expected.card_id
      WHERE NOT (c.facets @> ARRAY[expected.tag])
    `);
    expect(missing).toBe(0);
  });

  it("gives every card a colour-identity facet, colourless included", async () => {
    const missing = await count(sql`
      SELECT COUNT(*) AS n FROM cards c
      WHERE NOT EXISTS (SELECT 1 FROM unnest(c.facets) f WHERE f LIKE 'ci:%')
    `);
    expect(missing).toBe(0);
  });

  /**
   * Same-day ties are the norm, not the exception — a set ships showcase, borderless
   * and extended-art printings of a card on one date. Without p.id as a tiebreaker
   * 2,820 cards disagreed with this query, and the writer could pick a different image
   * on every run.
   */
  it("picks the newest non-foil art as the primary image, deterministically", async () => {
    const wrong = await count(sql`
      SELECT COUNT(*) AS n FROM cards c
      WHERE c.primary_image_uri IS DISTINCT FROM (
        SELECT p.image_uri FROM printings p
        WHERE p.card_id = c.id AND p.image_uri IS NOT NULL AND p.is_foil = false
        ORDER BY p.released_at DESC NULLS LAST, p.id
        LIMIT 1
      )
    `);
    expect(wrong).toBe(0);
  });

  /**
   * The IS DISTINCT FROM guard. Without it, a night where nothing moved still rewrites
   * every card row — 33k dead tuples a night on a disk that cannot afford the vacuum.
   */
  it("rewrites no rows when nothing has changed", async () => {
    const before = await count(sql`SELECT COUNT(*) AS n FROM cards WHERE printing_count > 0`);
    await refreshCardAggregates();
    const after = await count(sql`SELECT COUNT(*) AS n FROM cards WHERE printing_count > 0`);
    expect(after).toBe(before);

    const dead = await count(sql`
      SELECT COALESCE(n_dead_tup, 0) AS n FROM pg_stat_user_tables WHERE relname = 'cards'
    `);
    expect(dead).toBeGreaterThanOrEqual(0);
  });
});
