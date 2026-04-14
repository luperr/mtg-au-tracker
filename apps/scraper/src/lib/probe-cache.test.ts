import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { ProbeCache } from "./probe-cache.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;
let cacheFile: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "probe-cache-test-"));
  cacheFile = join(tmpDir, "test-cache.json");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeCache(fullScanIntervalDays = 7): ProbeCache {
  return new ProbeCache({ filePath: cacheFile, fullScanIntervalDays });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ProbeCache", () => {
  describe("load()", () => {
    it("silently handles missing file (first run)", async () => {
      const cache = makeCache();
      await expect(cache.load()).resolves.not.toThrow();
    });

    it("reads valid cache file", async () => {
      const cache = makeCache();
      await cache.save(["a", "b", "c"]);

      const cache2 = makeCache();
      await cache2.load();
      expect(cache2.getValidKeys()).toEqual(["a", "b", "c"]);
    });
  });

  describe("needsFullScan()", () => {
    it("returns true when no cache file exists", async () => {
      const cache = makeCache();
      await cache.load();
      expect(cache.needsFullScan()).toBe(true);
    });

    it("returns false for a fresh cache (saved just now)", async () => {
      const cache = makeCache(7);
      await cache.save(["x"]);

      const cache2 = makeCache(7);
      await cache2.load();
      expect(cache2.needsFullScan()).toBe(false);
    });

    it("returns true when lastFullScanAt is older than the interval", async () => {
      // Write a cache with a timestamp 8 days in the past
      const stale = {
        lastFullScanAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        validKeys: ["old"],
      };
      const cache = makeCache(7);
      // Use save() indirectly — write the stale file manually
      await import("fs/promises").then((fs) =>
        fs.writeFile(cacheFile, JSON.stringify(stale))
      );

      await cache.load();
      expect(cache.needsFullScan()).toBe(true);
    });

    it("returns false when cache is within the interval", async () => {
      const recent = {
        lastFullScanAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        validKeys: ["recent"],
      };
      const cache = makeCache(7);
      await import("fs/promises").then((fs) =>
        fs.writeFile(cacheFile, JSON.stringify(recent))
      );

      await cache.load();
      expect(cache.needsFullScan()).toBe(false);
    });
  });

  describe("getValidKeys()", () => {
    it("returns [] when no cache is loaded", async () => {
      const cache = makeCache();
      await cache.load(); // file missing
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
    it("round-trips validKeys through disk", async () => {
      const keys = ["alpha", "beta", "gamma"];
      const cache = makeCache();
      await cache.save(keys);

      const cache2 = makeCache();
      await cache2.load();
      expect(cache2.getValidKeys()).toEqual(keys);
    });

    it("writes valid JSON with lastFullScanAt and validKeys fields", async () => {
      const cache = makeCache();
      await cache.save(["x", "y"]);

      const raw = JSON.parse(await readFile(cacheFile, "utf-8")) as {
        lastFullScanAt: string;
        validKeys: string[];
      };
      expect(raw.validKeys).toEqual(["x", "y"]);
      expect(typeof raw.lastFullScanAt).toBe("string");
      expect(new Date(raw.lastFullScanAt).getTime()).toBeGreaterThan(0);
    });

    it("creates parent directories if they do not exist", async () => {
      const nestedFile = join(tmpDir, "nested", "deep", "cache.json");
      const cache = new ProbeCache({ filePath: nestedFile, fullScanIntervalDays: 7 });
      await expect(cache.save(["a"])).resolves.not.toThrow();

      const cache2 = new ProbeCache({ filePath: nestedFile, fullScanIntervalDays: 7 });
      await cache2.load();
      expect(cache2.getValidKeys()).toEqual(["a"]);
    });

    it("overwrites an existing cache file", async () => {
      const cache = makeCache();
      await cache.save(["old"]);
      await cache.save(["new1", "new2"]);

      const cache2 = makeCache();
      await cache2.load();
      expect(cache2.getValidKeys()).toEqual(["new1", "new2"]);
    });
  });
});
