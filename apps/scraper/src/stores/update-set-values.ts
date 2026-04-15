/**
 * Computes AU set values from current store_prices and writes them back to
 * the sets table as set_value_aud.
 *
 * Value = sum of cheapest in-stock non-foil price per unique card, across the
 * entire set family (root + non-token children). Basic lands excluded.
 *
 * Called once at the end of every nightly store scrape so the /sets listing
 * can read a pre-computed value without any joins.
 */

import { sql } from "drizzle-orm";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "update-set-values" });

export async function updateSetValues(): Promise<void> {
  log.info("Computing set values from current store_prices");

  // Single UPDATE: for each root set, sum the cheapest in-stock price per
  // card across the full family (root + non-token children).
  await db.execute(sql`
    WITH family AS (
      SELECT set_code AS root_code, set_code AS member_code
      FROM sets WHERE parent_set_code IS NULL
      UNION ALL
      SELECT parent_set_code AS root_code, set_code AS member_code
      FROM sets
      WHERE parent_set_code IS NOT NULL
        AND (set_type IS NULL OR set_type != 'token')
    ),
    card_min AS (
      SELECT f.root_code, p.card_id, MIN(sp.price_aud::numeric) AS min_price
      FROM family f
      JOIN printings p ON p.set_code = f.member_code AND p.is_foil = false
      JOIN cards c ON c.id = p.card_id
      JOIN store_prices sp ON sp.printing_id = p.id
      WHERE sp.in_stock = true
        AND sp.price_type = 'sell'
        AND c.type_line NOT ILIKE 'Basic Land%'
      GROUP BY f.root_code, p.card_id
    ),
    totals AS (
      SELECT root_code, SUM(min_price) AS total_value
      FROM card_min
      GROUP BY root_code
    )
    UPDATE sets
    SET set_value_aud = totals.total_value
    FROM totals
    WHERE sets.set_code = totals.root_code
  `);

  // Zero out root sets that have no in-stock data (scrape may have cleared them)
  await db.execute(sql`
    UPDATE sets
    SET set_value_aud = NULL
    WHERE parent_set_code IS NULL
      AND set_value_aud IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM store_prices sp
        JOIN printings p ON p.id = sp.printing_id
        WHERE p.set_code = sets.set_code
          AND sp.in_stock = true AND sp.price_type = 'sell'
      )
  `);

  log.info("Set values updated");
}
