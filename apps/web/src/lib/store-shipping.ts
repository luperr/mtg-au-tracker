import sql from "@/lib/db";
import { CACHE_REVALIDATE_HOUR } from "@/lib/config";

/** A store with prices on the site. `perItem`: no flat rate, so each listing ships separately (eBay). */
export type StoreSummary = { id: string; name: string; perItem: boolean };

type Stores = { rates: Record<string, number | null>; enabled: StoreSummary[]; expiresAt: number };

/**
 * One read of `stores`, cached in memory for CACHE_REVALIDATE_HOUR — it rarely
 * changes, and every want-list and optimiser request needs it. The promise is
 * cached, not just its result, so concurrent callers on a cold cache share one
 * query.
 */
let pending: Promise<Stores> | null = null;

async function read(): Promise<Stores> {
  const rows = await sql<{ id: string; name: string; flat_shipping_aud: string | null; scraper_enabled: boolean }[]>`
    SELECT id, name, flat_shipping_aud, scraper_enabled FROM stores ORDER BY name
  `;
  const rates: Record<string, number | null> = {};
  for (const row of rows) {
    rates[row.id] = row.flat_shipping_aud === null ? null : parseFloat(row.flat_shipping_aud);
  }
  const enabled = rows
    .filter((r) => r.scraper_enabled)
    .map((r) => ({ id: r.id, name: r.name, perItem: r.flat_shipping_aud === null }));
  return { rates, enabled, expiresAt: Date.now() + CACHE_REVALIDATE_HOUR * 1000 };
}

async function load(): Promise<Stores> {
  const current = pending ?? (pending = read());
  try {
    const stores = await current;
    if (stores.expiresAt > Date.now()) return stores;
  } catch (err) {
    if (pending === current) pending = null; // don't cache a failed read
    throw err;
  }
  if (pending === current) pending = read();
  return pending;
}

/**
 * Flat-rate postage per store (AUD), from stores.flat_shipping_aud — seeded from
 * STORE_REGISTRY in apps/scraper/src/stores/stores.config.ts, the single source
 * of truth for store registration. null means postage is per item (eBay, whose
 * shipping comes back on each price row instead).
 */
export async function getStoreShippingRates(): Promise<Record<string, number | null>> {
  return (await load()).rates;
}

/** Stores with prices on the site, by name — from the same cached read as the rates. */
export async function getEnabledStores(): Promise<StoreSummary[]> {
  return (await load()).enabled;
}
