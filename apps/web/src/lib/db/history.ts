import { sql } from "./client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PriceHistoryPoint = { date: string; price: number };
/**
 * One series per set the card was printed in.
 *
 * Was one series per printing, sourced from raw price_history. It is now per-set
 * because that is the grain set_card_daily holds — and the chart already labelled
 * every series with setName, so two printings from one set used to draw two lines
 * carrying the same label. Foils are excluded: set_card_daily filters them at build
 * time.
 */
export type SetHistory = {
  setCode: string;
  setName: string;
  data: PriceHistoryPoint[];
};
export type CardPriceHistory = {
  aggregate: PriceHistoryPoint[];
  bySet: SetHistory[];
};

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Price history for the card detail chart.
 *
 * Reads set_card_daily, the nightly pre-aggregate, rather than price_history itself.
 * price_history holds one row per printing per store per day — ~89M rows across 19GB
 * of monthly partitions — so drawing ~160 points meant fetching every raw row behind
 * them. Measured on prod for Counterspell (100 printings): 126,262 physical reads and
 * 109s cold, because those rows are scattered and the disks manage ~40 IOPS.
 *
 * set_card_daily already holds the answer at (set_code, card_id, recorded_at) grain,
 * which is why the series are per-set rather than per-printing. `sets` is ~987 rows,
 * so the name join is free.
 */
export async function getCardPriceHistory(cardId: string): Promise<CardPriceHistory> {
  const rows = await sql<{
    set_code: string;
    set_name: string;
    date: string;
    price: string;
  }[]>`
    SELECT
      scd.set_code,
      -- LEFT JOIN: sets and set_card_daily are both filled from the Scryfall import,
      -- so a gap shouldn't happen, but an inner join would silently drop a whole
      -- series from the chart if one ever did.
      COALESCE(s.set_name, scd.set_code) AS set_name,
      scd.recorded_at::text AS date,
      scd.min_price::text AS price
    FROM set_card_daily scd
    LEFT JOIN sets s ON s.set_code = scd.set_code
    WHERE scd.card_id = ${cardId}
    ORDER BY scd.recorded_at, 2
  `;

  // Aggregate: cheapest across every set that day.
  const aggMap = new Map<string, number>();
  for (const row of rows) {
    const p = parseFloat(row.price);
    const existing = aggMap.get(row.date);
    if (existing === undefined || p < existing) aggMap.set(row.date, p);
  }
  const aggregate = Array.from(aggMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, price]) => ({ date, price }));

  const setMap = new Map<string, SetHistory>();
  for (const row of rows) {
    if (!setMap.has(row.set_code)) {
      setMap.set(row.set_code, {
        setCode: row.set_code,
        setName: row.set_name,
        data: [],
      });
    }
    setMap.get(row.set_code)!.data.push({ date: row.date, price: parseFloat(row.price) });
  }
  // A single point draws no line.
  const bySet = Array.from(setMap.values()).filter((p) => p.data.length >= 2);

  return { aggregate, bySet };
}
