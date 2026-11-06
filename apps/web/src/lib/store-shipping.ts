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
export type StoreSummary = { id: string; name: string };

let cache: { rates: Record<string, number | null>; enabled: StoreSummary[]; expiresAt: number } | null = null;

async function load(): Promise<NonNullable<typeof cache>> {
  if (cache && cache.expiresAt > Date.now()) return cache;

  const rows = await sql<{ id: string; name: string; flat_shipping_aud: string | null; scraper_enabled: boolean }[]>`
    SELECT id, name, flat_shipping_aud, scraper_enabled FROM stores ORDER BY name
  `;
  const rates: Record<string, number | null> = {};
  for (const row of rows) {
    rates[row.id] = row.flat_shipping_aud === null ? null : parseFloat(row.flat_shipping_aud);
  }
  const enabled = rows.filter((r) => r.scraper_enabled).map((r) => ({ id: r.id, name: r.name }));

  cache = { rates, enabled, expiresAt: Date.now() + CACHE_REVALIDATE_HOUR * 1000 };
  return cache;
}

export async function getStoreShippingRates(): Promise<Record<string, number | null>> {
  return (await load()).rates;
}

/** Stores with prices on the site, by name — from the same cached read as the rates. */
export async function getEnabledStores(): Promise<StoreSummary[]> {
  return (await load()).enabled;
}
