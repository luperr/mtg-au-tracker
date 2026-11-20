import sql from "@/lib/db";
import { CACHE_REVALIDATE_HOUR } from "@/lib/config";
import { toFamilies, type SetFamily } from "@/lib/set-families";

export type { SetFamily };

/**
 * Every set family, for the want list's "exclude sets" filter. One read of `sets`, cached in
 * memory for CACHE_REVALIDATE_HOUR — it changes when Scryfall adds a set. The promise is cached,
 * so concurrent cold callers share one query.
 */
let pending: Promise<{ families: SetFamily[]; expiresAt: number }> | null = null;

export async function getSetFamilies(): Promise<SetFamily[]> {
  if (pending) {
    const cached = await pending.catch(() => null);
    if (cached && cached.expiresAt > Date.now()) return cached.families;
  }
  pending = (async () => {
    // Alchemy sets are digital only: nothing to buy.
    const rows = await sql<{ set_code: string; set_name: string; parent_set_code: string | null; released_at: string }[]>`
      SELECT set_code, set_name, parent_set_code, released_at::text AS released_at
      FROM sets
      WHERE set_type IS DISTINCT FROM 'alchemy'
    `;
    return { families: toFamilies([...rows]), expiresAt: Date.now() + CACHE_REVALIDATE_HOUR * 1000 };
  })();
  pending.catch(() => { pending = null; });
  return (await pending).families;
}
