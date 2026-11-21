/**
 * card_listings — store_prices, physically ordered by card (schema.ts, migration 0020).
 *
 * The web app reads every listing by card: search, the card page, the optimiser, import and the
 * printing picker. store_prices is written store by store, so one card's listings are scattered
 * across ~36 pages, and on the ~40 IOPS disks, cold after every rewrite, a broad search paid one
 * seek per page ("dragon": 6.8k pages). In card order the same read is ~600 contiguous pages.
 *
 * The table is rebuilt wholesale and swapped in, never updated in place. An in-place DELETE +
 * INSERT would leave the new rows in whatever free space the old ones left, which is exactly the
 * scatter this exists to undo.
 */

import { sql } from "drizzle-orm";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "card-listings" });

/** pg advisory lock key: one rebuild at a time across the cron, run-store.ts and the eBay import. */
const REBUILD_LOCK = 724_001;
const SWAP_ATTEMPTS = 5;

const COLUMNS = sql.raw(
  "card_id, id, printing_id, store_id, price_aud, shipping_aud, price_type, condition, in_stock, url, scraped_at",
);

function isLockTimeout(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e?.code ?? e?.cause?.code) === "55P03"; // lock_not_available
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Rebuilds card_listings from store_prices and swaps it in.
 *
 * One transaction. It builds `card_listings_next` (an ordered INSERT, then the index and
 * statistics) while readers keep using the current table, then swaps the two by renaming. The
 * rename needs an exclusive lock, so it runs with a short lock_timeout in a savepoint and retries:
 * a long-running search must not leave every new reader queued behind the swap.
 *
 * Never throws. If the rebuild fails, the transaction rolls back (`_next` goes with it) and the
 * previous copy keeps serving, just stale. Same rule as refreshCardPrices(): the prices themselves
 * are already committed in store_prices.
 */
export async function rebuildCardListings(reason: string): Promise<void> {
  const started = Date.now();
  try {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${REBUILD_LOCK})`);
      // The sort is ~250MB; keep it in memory, off the slow disk.
      await tx.execute(sql`SET LOCAL work_mem = '256MB'`);
      await tx.execute(sql`DROP TABLE IF EXISTS card_listings_next`);
      await tx.execute(sql`CREATE TABLE card_listings_next (LIKE card_listings INCLUDING DEFAULTS)`);
      const inserted = await tx.execute(sql`
        INSERT INTO card_listings_next (${COLUMNS})
        SELECT p.card_id, sp.id, sp.printing_id, sp.store_id, sp.price_aud, sp.shipping_aud,
               sp.price_type, sp.condition, sp.in_stock, sp.url, sp.scraped_at
        FROM store_prices sp
        JOIN printings p ON p.id = sp.printing_id
        ORDER BY p.card_id, sp.printing_id, sp.id
      `);
      // After the fill: one index build is far cheaper than maintaining it row by row.
      await tx.execute(sql`CREATE INDEX card_listings_next_card_printing_idx ON card_listings_next (card_id, printing_id)`);
      await tx.execute(sql`ANALYZE card_listings_next`);

      await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
      for (let attempt = 1; ; attempt++) {
        try {
          await tx.transaction(async (swap) => {
            await swap.execute(sql`ALTER TABLE card_listings RENAME TO card_listings_old`);
            await swap.execute(sql`ALTER INDEX card_listings_card_printing_idx RENAME TO card_listings_old_card_printing_idx`);
            await swap.execute(sql`ALTER TABLE card_listings_next RENAME TO card_listings`);
            await swap.execute(sql`ALTER INDEX card_listings_next_card_printing_idx RENAME TO card_listings_card_printing_idx`);
          });
          break;
        } catch (err) {
          if (!isLockTimeout(err) || attempt >= SWAP_ATTEMPTS) throw err;
          log.warn({ attempt, reason }, "card_listings swap waited on a running query — retrying");
          await sleep(attempt * 1000);
        }
      }
      await tx.execute(sql`DROP TABLE card_listings_old`);
      return inserted.count ?? 0;
    });
    log.info({ rows, duration_ms: Date.now() - started, reason }, "Rebuilt card_listings");
  } catch (err) {
    log.error(
      { err, duration_ms: Date.now() - started, reason },
      "card_listings rebuild failed — the site keeps reading the previous copy until the next rebuild",
    );
  }
}
