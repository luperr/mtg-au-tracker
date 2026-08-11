import { describe, it, expect, vi, afterEach } from "vitest";
import { BaseScraper, ChallengeDetectedError, RetryableHttpError, isTransientFetchError } from "./base-scraper.js";
import type { ScrapedCard } from "@mtg-au/shared";

// A minimal concrete subclass so we can exercise the protected fetchJsonPlain()
// path directly, without touching Playwright (fetchJson()'s browser fallback
// needs a real Chromium instance and isn't exercised here).
class TestScraper extends BaseScraper {
  async *scrapeAll(): AsyncGenerator<ScrapedCard> {}

  fetchJsonPlainForTest<T>(url: string): Promise<T> {
    return this.fetchJsonPlain<T>(url);
  }

  fetchTextPlainForTest(url: string): Promise<string> {
    return this.fetchTextPlain(url, "text/html");
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

  // "Just a moment" is a real English phrase that turns up in card names,
  // flavour text and third-party widget markup. Matching it anywhere in the
  // body latched the whole run onto Chromium — thousands of page loads — off a
  // single false positive.
  it("does not treat a normal page mentioning 'Just a moment' in its content as a challenge", async () => {
    const body =
      "<html><head><title>Ancestral Recall - Store</title></head>" +
      "<body><p>Just a moment, we're checking stock.</p></body></html>";
    mockFetchOnce(200, body);
    const scraper = new TestScraper();
    await expect(scraper.fetchTextPlainForTest("https://example.com/page")).resolves.toBe(body);
  });

  it("still detects an interstitial whose marker sits outside the title", async () => {
    mockFetchOnce(403, "<html><body><div id='cf-browser-verification'></div></body></html>");
    const scraper = new TestScraper();
    await expect(scraper.fetchTextPlainForTest("https://example.com/page")).rejects.toBeInstanceOf(
      ChallengeDetectedError,
    );
  });
});

// ─── isTransientFetchError ────────────────────────────────────────────────────
// A single Shopify walk can run to hundreds of requests, so a stalled request
// must be retried rather than ending the store's whole run.

describe("isTransientFetchError", () => {
  it("retries a retryable HTTP status", () => {
    expect(isTransientFetchError(new RetryableHttpError(503, "http://x"))).toBe(true);
  });

  it("retries a request aborted by AbortSignal.timeout()", () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    expect(isTransientFetchError(err)).toBe(true);
  });

  it("retries an AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isTransientFetchError(err)).toBe(true);
  });

  it("retries undici's dropped-connection TypeError", () => {
    expect(isTransientFetchError(new TypeError("fetch failed"))).toBe(true);
  });

  // A challenge means "switch to the browser", not "try the same way again".
  it("does not retry a bot challenge", () => {
    expect(isTransientFetchError(new ChallengeDetectedError("cf"))).toBe(false);
  });

  it("does not retry an ordinary error", () => {
    expect(isTransientFetchError(new Error("HTTP 404 fetching http://x"))).toBe(false);
  });

  it("does not retry a non-Error value", () => {
    expect(isTransientFetchError("boom")).toBe(false);
  });
});
