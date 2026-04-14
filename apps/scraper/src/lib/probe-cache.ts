/**
 * ProbeCache — generic cache for "probe N targets, many return nothing" scrapers.
 *
 * Pattern: a scraper discovers a large set of candidate keys (e.g. set codes, category
 * slugs, collection handles) and must HTTP-probe each one. Many return 404 / empty data.
 * After the first full run, only the hits need to be re-probed on subsequent runs.
 * A periodic full rescan detects newly added targets.
 *
 * Usage:
 *   const cache = new ProbeCache({ filePath: "/data/foo-valid-keys.json", fullScanIntervalDays: 7 });
 *   await cache.load();
 *
 *   const isFullScan = cache.needsFullScan();
 *   const toProbe = isFullScan ? allKeys : cache.getValidKeys();
 *
 *   // ... probe toProbe, collect hits ...
 *
 *   if (isFullScan) await cache.save(hits);
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

export interface ProbeCacheOptions {
  /** Absolute or relative path to the JSON cache file. */
  filePath: string;
  /** How many days between full re-probes of all targets. Default: 7. */
  fullScanIntervalDays?: number;
}

interface ProbeCacheData {
  lastFullScanAt: string; // ISO timestamp
  validKeys: string[];
}

export class ProbeCache {
  private readonly filePath: string;
  private readonly fullScanIntervalMs: number;
  private data: ProbeCacheData | null = null;

  constructor(options: ProbeCacheOptions) {
    this.filePath = options.filePath;
    this.fullScanIntervalMs = (options.fullScanIntervalDays ?? 7) * 24 * 60 * 60 * 1000;
  }

  /**
   * Load the cache from disk. Silent no-op if the file does not exist (first run).
   * Call this before needsFullScan() or getValidKeys().
   */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      this.data = JSON.parse(raw) as ProbeCacheData;
    } catch (err: unknown) {
      // ENOENT = first run, treat as cache miss
      const isNotFound = err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
      if (!isNotFound) {
        // Unexpected read/parse error — log and treat as cache miss so scrape still runs
        process.stderr.write(`[probe-cache] Failed to read ${this.filePath}: ${String(err)}\n`);
      }
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
   * Persist a new set of valid keys to disk, stamped with the current time.
   * Only call this after a full scan completes successfully.
   */
  async save(validKeys: string[]): Promise<void> {
    const payload: ProbeCacheData = {
      lastFullScanAt: new Date().toISOString(),
      validKeys,
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(payload, null, 2));
  }
}
