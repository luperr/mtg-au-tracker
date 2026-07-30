import { describe, it, expect, vi, afterEach } from "vitest";
import { BaseScraper, ChallengeDetectedError, RetryableHttpError } from "./base-scraper.js";
import type { ScrapedCard } from "@mtg-au/shared";

// A minimal concrete subclass so we can exercise the protected fetchJsonPlain()
// path directly, without touching Playwright (fetchJson()'s browser fallback
// needs a real Chromium instance and isn't exercised here).
class TestScraper extends BaseScraper {
  async *scrapeAll(): AsyncGenerator<ScrapedCard> {}

  fetchJsonPlainForTest<T>(url: string): Promise<T> {
    return this.fetchJsonPlain<T>(url);
  }
}

function mockFetchOnce(status: number, body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      text: () => Promise.resolve(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BaseScraper.fetchJsonPlain", () => {
  it("parses and returns JSON on a successful response", async () => {
    mockFetchOnce(200, JSON.stringify({ products: [] }));
    const scraper = new TestScraper();
    const result = await scraper.fetchJsonPlainForTest("https://example.com/products.json");
    expect(result).toEqual({ products: [] });
  });

  it("throws ChallengeDetectedError on a 403 response", async () => {
    mockFetchOnce(403, "Forbidden");
    const scraper = new TestScraper();
    await expect(scraper.fetchJsonPlainForTest("https://example.com/products.json")).rejects.toBeInstanceOf(
      ChallengeDetectedError,
    );
  });

  // A bare 503 means the origin is shedding load, not blocking us. Treating it
  // as a challenge would latch the scraper onto the browser path for the rest of
  // the run — slower, and harder on an already-struggling server.
  it("throws RetryableHttpError (not a challenge) on a bare 503 response", async () => {
    mockFetchOnce(503, "Service Unavailable");
    const scraper = new TestScraper();
    const promise = scraper.fetchJsonPlainForTest("https://example.com/products.json");
    await expect(promise).rejects.toBeInstanceOf(RetryableHttpError);
    await expect(promise).rejects.not.toBeInstanceOf(ChallengeDetectedError);
  });

  it("throws RetryableHttpError on a 429 response", async () => {
    mockFetchOnce(429, "Too Many Requests");
    const scraper = new TestScraper();
    await expect(scraper.fetchJsonPlainForTest("https://example.com/products.json")).rejects.toBeInstanceOf(
      RetryableHttpError,
    );
  });

  // Cloudflare has served challenges with a 503 — the body check must win over
  // the status classification so those are still routed to the browser.
  it("still throws ChallengeDetectedError on a 503 carrying a Cloudflare interstitial body", async () => {
    mockFetchOnce(503, "<html><title>Just a moment...</title></html>");
    const scraper = new TestScraper();
    await expect(scraper.fetchJsonPlainForTest("https://example.com/products.json")).rejects.toBeInstanceOf(
      ChallengeDetectedError,
    );
  });

  it("throws ChallengeDetectedError on a Cloudflare interstitial body with a 200 status", async () => {
    mockFetchOnce(200, "<html><title>Just a moment...</title></html>");
    const scraper = new TestScraper();
    await expect(scraper.fetchJsonPlainForTest("https://example.com/products.json")).rejects.toBeInstanceOf(
      ChallengeDetectedError,
    );
  });

  it("throws a plain Error (not a challenge) on an unrelated 500", async () => {
    mockFetchOnce(500, "Internal Server Error");
    const scraper = new TestScraper();
    await expect(scraper.fetchJsonPlainForTest("https://example.com/products.json")).rejects.not.toBeInstanceOf(
      ChallengeDetectedError,
    );
  });
});
