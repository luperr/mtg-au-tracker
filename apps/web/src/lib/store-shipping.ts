import sql from "@/lib/db";
import { CACHE_REVALIDATE_HOUR } from "@/lib/config";

/**
 * Flat-rate postage per store (AUD), sourced from stores.flat_shipping_aud —
 * seeded from STORE_REGISTRY in apps/scraper/src/stores/stores.config.ts, the
 * single source of truth for store registration. null means "unknown / varies"
 * (e.g. eBay, whose shipping is per-seller and comes back on each price row
 * instead) — no estimated postage will be shown.
 *
 * Cached in memory for CACHE_REVALIDATE_HOUR — this rarely changes, and every
 * want-list/optimizer request needs it synchronously available.
 */
let cache: { rates: Record<string, number | null>; expiresAt: number } | null = null;

export async function getStoreShippingRates(): Promise<Record<string, number | null>> {
  if (cache && cache.expiresAt > Date.now()) return cache.rates;

  const rows = await sql<{ id: string; flat_shipping_aud: string | null }[]>`
    SELECT id, flat_shipping_aud FROM stores
  `;
  const rates: Record<string, number | null> = {};
  for (const row of rows) {
    rates[row.id] = row.flat_shipping_aud === null ? null : parseFloat(row.flat_shipping_aud);
  }

  cache = { rates, expiresAt: Date.now() + CACHE_REVALIDATE_HOUR * 1000 };
  return rates;
}
