/**
 * ProbeCache — generic cache for "probe N targets, many return nothing" scrapers.
 *
 * Pattern: a scraper discovers a large set of candidate keys (e.g. set codes, category
 * slugs, collection handles) and must HTTP-probe each one. Many return 404 / empty data.
 * After the first full run, only the hits need to be re-probed on subsequent runs.
 * A periodic full rescan detects newly added targets.
 *
 * Backed by the `scraper_cache` table, one row per cache key. It used to be JSON files
 * under apps/scraper/data; that made the scraper's local disk the only thing standing
 * between it and being fully ephemeral, and a lost cache costs a full CrystalCommerce
 * sweep (1.5-4h). Every scrape already requires the DB, so nothing new can fail here.
 *
 * Usage:
 *   const cache = new ProbeCache({ key: "mtgmate-valid-sets", fullScanIntervalDays: 7 });
 *   await cache.load();
 *
 *   const isFullScan = cache.needsFullScan();
 *   const toProbe = isFullScan ? allKeys : cache.getValidKeys();
 *
 *   // ... probe toProbe, collect hits ...
 *
 *   if (isFullScan) await cache.save(hits);
 */

import { eq } from "drizzle-orm";
import { db, schema } from "./db.js";

export interface ProbeCacheOptions {
  /** Row key in `scraper_cache`, e.g. "crystalcommerce-games_cube-categories". */
  key: string;
  /** How many days between full re-probes of all targets. Default: 7. */
  fullScanIntervalDays?: number;
}

interface ProbeCacheData {
  lastFullScanAt: Date;
  validKeys: string[];
}

export class ProbeCache {
  private readonly key: string;
  private readonly fullScanIntervalMs: number;
  private data: ProbeCacheData | null = null;

  constructor(options: ProbeCacheOptions) {
    this.key = options.key;
    this.fullScanIntervalMs = (options.fullScanIntervalDays ?? 7) * 24 * 60 * 60 * 1000;
  }

  /**
   * Load the cache row. Silent no-op when no row exists (first run).
   * Call this before needsFullScan() or getValidKeys().
   */
  async load(): Promise<void> {
    try {
      const rows = await db
        .select({
          lastFullScanAt: schema.scraperCache.lastFullScanAt,
          validKeys: schema.scraperCache.validKeys,
        })
        .from(schema.scraperCache)
        .where(eq(schema.scraperCache.key, this.key))
        .limit(1);

      this.data = rows[0] ?? null;
    } catch (err: unknown) {
      // Treat any read failure as a cache miss so the scrape still runs — a full
      // scan is slow but correct, whereas failing here would skip the store entirely.
      process.stderr.write(`[probe-cache] Failed to read "${this.key}": ${String(err)}\n`);
      this.data = null;
    }
  }

  /**
   * True when no cache exists or the last full scan is older than fullScanIntervalDays.
   * Must call load() first.
   */
  needsFullScan(): boolean {
    if (!this.data) return true;
    const age = Date.now() - new Date(this.data.lastFullScanAt).getTime();
    return age >= this.fullScanIntervalMs;
  }

  /**
   * Returns the valid keys from the last full scan.
   * Returns [] if no cache is loaded (i.e. a full scan should be performed instead).
   */
  getValidKeys(): string[] {
    return this.data?.validKeys ?? [];
  }

  /**
   * Persist a new set of valid keys, stamped with the current time.
   * Only call this after a full scan completes successfully.
   */
  async save(validKeys: string[]): Promise<void> {
    const lastFullScanAt = new Date();
    await db
      .insert(schema.scraperCache)
      .values({ key: this.key, lastFullScanAt, validKeys })
      .onConflictDoUpdate({
        target: schema.scraperCache.key,
        set: { lastFullScanAt, validKeys },
      });
    this.data = { lastFullScanAt, validKeys };
  }
}
