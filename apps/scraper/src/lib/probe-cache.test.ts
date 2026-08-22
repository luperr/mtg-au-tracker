import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── DB stub ──────────────────────────────────────────────────────────────────
//
// ProbeCache is now backed by the `scraper_cache` table, so the tests stand in a
// fake for the two Drizzle chains it uses. `eq` is stubbed to hand back the raw
// value so the fake can key off it without interpreting real SQL objects.

interface Row {
  lastFullScanAt: Date;
  validKeys: string[];
}

const rows = new Map<string, Row>();
let failReads = false;

vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  eq: (_column: unknown, value: string) => ({ __eqValue: value }),
}));

vi.mock("./db.js", () => ({
  schema: {
    scraperCache: { key: "key", lastFullScanAt: "last_full_scan_at", validKeys: "valid_keys" },
  },
  db: {
    select: () => ({
      from: () => ({
        where: (cond: { __eqValue: string }) => ({
          limit: () => {
            if (failReads) return Promise.reject(new Error("connection refused"));
            const row = rows.get(cond.__eqValue);
            return Promise.resolve(row ? [row] : []);
          },
        }),
      }),
    }),
    insert: () => ({
      values: (v: Row & { key: string }) => ({
        onConflictDoUpdate: () => {
          rows.set(v.key, { lastFullScanAt: v.lastFullScanAt, validKeys: v.validKeys });
          return Promise.resolve();
        },
      }),
    }),
  },
}));

const { ProbeCache } = await import("./probe-cache.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KEY = "test-cache";

beforeEach(() => {
  rows.clear();
  failReads = false;
});

function makeCache(fullScanIntervalDays = 7, key = KEY) {
  return new ProbeCache({ key, fullScanIntervalDays });
}

function seed(key: string, daysAgo: number, validKeys: string[]): void {
  rows.set(key, {
    lastFullScanAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    validKeys,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ProbeCache", () => {
  describe("load()", () => {
    it("silently handles a missing row (first run)", async () => {
      const cache = makeCache();
      await expect(cache.load()).resolves.not.toThrow();
      expect(cache.getValidKeys()).toEqual([]);
    });

    it("reads an existing row", async () => {
      const cache = makeCache();
      await cache.save(["a", "b", "c"]);

      const cache2 = makeCache();
      await cache2.load();
      expect(cache2.getValidKeys()).toEqual(["a", "b", "c"]);
    });

    it("treats a read failure as a cache miss rather than throwing", async () => {
      seed(KEY, 1, ["a"]);
      failReads = true;

      const cache = makeCache();
      await expect(cache.load()).resolves.not.toThrow();
      // A full scan is slow but correct; failing here would skip the store entirely.
      expect(cache.needsFullScan()).toBe(true);
      expect(cache.getValidKeys()).toEqual([]);
    });

    it("only reads its own key", async () => {
      seed("someone-elses-cache", 1, ["not", "mine"]);

      const cache = makeCache();
      await cache.load();
      expect(cache.getValidKeys()).toEqual([]);
    });
  });

  describe("needsFullScan()", () => {
    it("returns true when no row exists", async () => {
      const cache = makeCache();
      await cache.load();
      expect(cache.needsFullScan()).toBe(true);
    });

    it("returns false for a fresh cache (saved just now)", async () => {
      const cache = makeCache(7);
      await cache.save(["a"]);

      const cache2 = makeCache(7);
      await cache2.load();
      expect(cache2.needsFullScan()).toBe(false);
    });

    it("returns true when lastFullScanAt is older than the interval", async () => {
      seed(KEY, 8, ["old"]);

      const cache = makeCache(7);
      await cache.load();
      expect(cache.needsFullScan()).toBe(true);
    });

    it("returns false when the cache is within the interval", async () => {
      seed(KEY, 3, ["recent"]);

      const cache = makeCache(7);
      await cache.load();
      expect(cache.needsFullScan()).toBe(false);
    });
  });

  describe("getValidKeys()", () => {
    it("returns [] when no cache is loaded", async () => {
      const cache = makeCache();
      await cache.load();
      expect(cache.getValidKeys()).toEqual([]);
    });

    it("returns the cached keys after load", async () => {
      const cache = makeCache();
      await cache.save(["dmu", "m11", "neo"]);

      const cache2 = makeCache();
      await cache2.load();
      expect(cache2.getValidKeys()).toEqual(["dmu", "m11", "neo"]);
    });
  });

  describe("save()", () => {
    it("round-trips validKeys through the table", async () => {
      const keys = ["alpha", "beta", "gamma"];
      const cache = makeCache();
      await cache.save(keys);

      const cache2 = makeCache();
      await cache2.load();
      expect(cache2.getValidKeys()).toEqual(keys);
    });

    it("stamps lastFullScanAt with the current time", async () => {
      const before = Date.now();
      const cache = makeCache();
      await cache.save(["x", "y"]);

      const row = rows.get(KEY);
      expect(row?.validKeys).toEqual(["x", "y"]);
      expect(row?.lastFullScanAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it("upserts over an existing row rather than adding a second one", async () => {
      const cache = makeCache();
      await cache.save(["old"]);
      await cache.save(["new1", "new2"]);

      expect(rows.size).toBe(1);
      const cache2 = makeCache();
      await cache2.load();
      expect(cache2.getValidKeys()).toEqual(["new1", "new2"]);
    });

    it("keeps the in-memory state current, so no reload is needed", async () => {
      const cache = makeCache(7);
      await cache.load(); // miss — needsFullScan() is true
      expect(cache.needsFullScan()).toBe(true);

      await cache.save(["a"]);
      expect(cache.needsFullScan()).toBe(false);
      expect(cache.getValidKeys()).toEqual(["a"]);
    });

    it("keeps separate keys independent", async () => {
      await makeCache(7, "cache-a").save(["a1"]);
      await makeCache(7, "cache-b").save(["b1"]);

      const a = makeCache(7, "cache-a");
      await a.load();
      const b = makeCache(7, "cache-b");
      await b.load();

      expect(a.getValidKeys()).toEqual(["a1"]);
      expect(b.getValidKeys()).toEqual(["b1"]);
    });
  });
});
