/**
 * Abstract base class for all HTML store scrapers.
 *
 * Uses Playwright (headless Chromium) so Cloudflare bot challenges are handled
 * automatically by a real browser engine.
 *
 * Provides:
 *   - fetchPage(url)                   — load a page, wait for CF challenge, return HTML
 *   - fetchPageWaitFor(url, selector)  — same, but also waits for a CSS selector to
 *                                        appear (needed for React-rendered content)
 *   - fetchHtml(url)                   — fetch an HTML page. Plain `fetch()` first,
 *                                        falling back to fetchPage() (browser) if the
 *                                        store turns out to be behind a bot challenge.
 *   - fetchJson<T>(url)                — fetch a JSON endpoint. Tries a plain `fetch()`
 *                                        first (no browser cost); if that hits a bot
 *                                        challenge (403/503 or a Cloudflare interstitial
 *                                        body), falls back to the browser for the rest
 *                                        of this scraper instance's lifetime. All 32
 *                                        Shopify stores fetch nothing but JSON, so most
 *                                        never pay for a Chromium page at all.
 *   - close()                          — shuts down the browser when scraping is done
 *
 * All methods share one Browser + BrowserContext (opened lazily, closed via close()).
 * Rate-limited to 500ms between requests (sequential) — concurrent scrapers manage
 * their own pacing via concurrency limits rather than this global timer.
 */

import { chromium, type Browser, type BrowserContext } from "playwright";
import type { ScrapedCard, StoreScraper } from "@mtg-au/shared";
import { logger } from "../lib/logger.js";
import {
  USER_AGENT,
  PLAIN_FETCH_TIMEOUT_MS,
  HTTP_MAX_RETRIES,
  HTTP_RETRY_BACKOFF_MS,
} from "../lib/config.js";

const log = logger.child({ component: "base-scraper" });

/** Thrown by the plain-fetch path when the response looks like a bot challenge. */
export class ChallengeDetectedError extends Error {}

/**
 * A transient server-side failure worth retrying as-is (429, 502, 503, 504).
 *
 * Deliberately NOT a ChallengeDetectedError: an overloaded origin shedding load
 * must not latch the scraper onto the browser path, which would only make it
 * slower and hit the struggling server harder.
 */
export class RetryableHttpError extends Error {
  constructor(readonly status: number, url: string) {
    super(`HTTP ${status} (retryable) fetching ${url}`);
  }
}

/** Statuses that mean "try again shortly", not "you've been blocked". */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/**
 * True for failures worth another go: a retryable status, or a request that
 * timed out or had its connection dropped.
 *
 * AbortSignal.timeout() raises a TimeoutError DOMException, and undici reports
 * a dropped connection as a TypeError whose cause carries the socket error —
 * neither is an instance of any type we can import, so they are matched by
 * name. A ChallengeDetectedError is deliberately excluded: that one means
 * "switch to the browser", not "try again".
 */
export function isTransientFetchError(err: unknown): boolean {
  if (err instanceof RetryableHttpError) return true;
  if (err instanceof ChallengeDetectedError) return false;
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return true;
    // undici wraps socket-level failures ("fetch failed") around a cause.
    if (err.name === "TypeError" && /fetch failed/i.test(err.message)) return true;
  }
  return false;
}

/**
 * True when a response body is a Cloudflare interstitial.
 *
 * Deliberately narrow. An earlier version matched "Just a moment" anywhere in
 * the body, which is a real phrase that can appear in card names, flavour text
 * or third-party widget markup — and one false positive latches the scraper
 * onto Chromium for the rest of the run (~3,500 page loads on a Games Cube
 * sweep). A genuine interstitial puts it in the <title>, near the top of a tiny
 * document, so only the document head is searched.
 */
function isChallengeBody(text: string): boolean {
  const head = text.slice(0, CHALLENGE_SCAN_BYTES);
  return /<title>\s*Just a moment/i.test(head) || head.includes("cf-browser-verification");
}

/** Interstitials are a couple of KB; real pages put their <title> up here too. */
const CHALLENGE_SCAN_BYTES = 4096;

export abstract class BaseScraper implements StoreScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private lastRequestAt = 0;
  private readonly rateLimitMs = 500;
  // Once a plain fetch() hits a bot challenge, remember it for the rest of this
  // run so we don't keep re-discovering the same block on every subsequent call.
  private useBrowserForJson = false;
  private useBrowserForHtml = false;

  private async getContext(): Promise<BrowserContext> {
    if (!this.context) {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.browser.newContext({
        userAgent: USER_AGENT,
        locale: "en-AU",
        timezoneId: "Australia/Sydney",
      });
    }
    return this.context;
  }

  private async rateLimit(): Promise<void> {
    const wait = this.rateLimitMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  private async waitForCloudflare(page: import("playwright").Page): Promise<void> {
    await page
      .waitForFunction(() => !document.title.includes("Just a moment"), { timeout: 15000 })
      .catch(() => {
        log.warn("Cloudflare challenge may not have cleared");
      });
  }

  // Fetch a page and return its HTML after the load event + CF challenge clear
  protected async fetchPage(url: string): Promise<string> {
    await this.rateLimit();
    const context = await this.getContext();
    const page = await context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: "load", timeout: 30000 });
      await this.waitForCloudflare(page);
      // Without this an error page comes back as perfectly valid HTML, so
      // callers that key off "HTTP 404" (CrystalCommerce's fetchWithRetry)
      // silently treat a dead URL as an empty one. 403 is excluded: that's the
      // challenge status this browser path exists to clear.
      this.assertBrowserResponseOk(response, url);
      const content = await page.content();
      this.lastRequestAt = Date.now();
      return content;
    } finally {
      await page.close();
    }
  }

  private assertBrowserResponseOk(
    response: import("playwright").Response | null,
    url: string,
  ): void {
    if (!response) return; // e.g. same-document navigation — nothing to judge
    const status = response.status();
    if (status >= 400 && status !== 403) {
      throw new Error(`HTTP ${status} fetching ${url}`);
    }
  }

  // Like fetchPage, but also waits for a CSS selector to appear after React hydrates
  protected async fetchPageWaitFor(url: string, selector: string): Promise<string> {
    await this.rateLimit();
    const context = await this.getContext();
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      await this.waitForCloudflare(page);
      await page.waitForSelector(selector, { timeout: 20000 }).catch(() => {
        log.warn({ url, selector }, "Selector not found after page load");
      });
      const content = await page.content();
      this.lastRequestAt = Date.now();
      return content;
    } finally {
      await page.close();
    }
  }

  /**
   * Retry `attempt` while it fails transiently — a RetryableHttpError
   * (429/502/503/504) or a request that timed out or dropped.
   *
   * These are transient origin failures, so the browser fallback is no help —
   * but they must not escape either. Callers up the stack (ShopifyScraper,
   * MtgMateScraper) turn a thrown fetch error into "no products here", which a
   * paginating scraper cannot distinguish from the end of the catalogue: one
   * blip mid-pagination silently truncates a store whose prices have already
   * been deleted for the run. Retrying here is what keeps that rare.
   *
   * Timeouts count because a single walk can run to hundreds of requests, and a
   * store that stalls one of them would otherwise fail the whole run — observed
   * on Cardhouse, where one aborted request ended a scrape already 25,000
   * products in.
   */
  private async withRetry<T>(url: string, attempt: () => Promise<T>): Promise<T> {
    for (let i = 0; ; i++) {
      try {
        return await attempt();
      } catch (err) {
        if (!isTransientFetchError(err) || i >= HTTP_MAX_RETRIES) throw err;
        const backoff = HTTP_RETRY_BACKOFF_MS[i];
        const status = err instanceof RetryableHttpError ? err.status : undefined;
        log.warn(
          { url, status, err: status === undefined ? String(err) : undefined, attempt: i + 1, backoff },
          "Transient fetch failure — retrying",
        );
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  // Fetch a JSON endpoint. Plain fetch() first (cheap); falls back to a real
  // browser page only if this store turns out to be behind a bot challenge.
  protected async fetchJson<T>(url: string): Promise<T> {
    await this.rateLimit();

    if (!this.useBrowserForJson) {
      try {
        const result = await this.withRetry(url, () => this.fetchJsonPlain<T>(url));
        this.lastRequestAt = Date.now();
        return result;
      } catch (err) {
        if (!(err instanceof ChallengeDetectedError)) throw err;
        log.warn({ url }, "Plain fetch hit a bot challenge — switching to browser fetch for this store");
        this.useBrowserForJson = true;
      }
    }

    return this.fetchJsonViaBrowser<T>(url);
  }

  // Same trade-off as fetchJson, for HTML pages: plain fetch is ~30x cheaper
  // than a Chromium page load, which matters for stores scraped a page at a
  // time. Falls back to fetchPage() for the rest of the run on a challenge.
  protected async fetchHtml(url: string): Promise<string> {
    if (!this.useBrowserForHtml) {
      await this.rateLimit();
      try {
        const html = await this.withRetry(url, () => this.fetchTextPlain(url, "text/html"));
        this.lastRequestAt = Date.now();
        return html;
      } catch (err) {
        if (!(err instanceof ChallengeDetectedError)) throw err;
        log.warn({ url }, "Plain fetch hit a bot challenge — switching to browser fetch for this store");
        this.useBrowserForHtml = true;
      }
    }

    return this.fetchPage(url);
  }

  protected async fetchJsonPlain<T>(url: string): Promise<T> {
    const text = await this.fetchTextPlain(url, "application/json");
    return JSON.parse(text) as T;
  }

  /**
   * POST a JSON body and parse the JSON response.
   *
   * Deliberately has no browser fallback, unlike fetchJson(). This exists for
   * GraphQL API endpoints, which are not the pages a bot challenge protects —
   * and a Chromium page load cannot replay a POST body anyway. Transient
   * statuses are still retried, so a blip mid-pagination doesn't read as the
   * end of the catalogue.
   */
  protected async postJson<T>(url: string, body: unknown): Promise<T> {
    await this.rateLimit();
    const text = await this.withRetry(url, () =>
      this.fetchTextPlain(url, "application/json", JSON.stringify(body)),
    );
    this.lastRequestAt = Date.now();
    return JSON.parse(text) as T;
  }

  // Plain fetch() with bot-challenge detection. Classifies on the body first,
  // then the status, so a Cloudflare interstitial is still recognised whatever
  // status it arrives with — while a bare 503 from an overloaded origin is
  // treated as retryable instead of as a block.
  protected async fetchTextPlain(url: string, accept: string, postBody?: string): Promise<string> {
    // Node's fetch() has no default timeout: a server that accepts the
    // connection and then never responds hangs the whole scrape forever.
    // Matches the 30s used on the Playwright paths.
    const response = await fetch(url, {
      method: postBody === undefined ? "GET" : "POST",
      body: postBody,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        // These pages are ~380KB of HTML that gzip to ~49KB. undici sets this
        // by default, but pinning it keeps the win if that ever changes.
        "Accept-Encoding": "gzip, deflate, br",
        ...(postBody === undefined ? {} : { "Content-Type": "application/json" }),
      },
      signal: AbortSignal.timeout(PLAIN_FETCH_TIMEOUT_MS),
    });

    const text = await response.text();

    if (isChallengeBody(text)) {
      throw new ChallengeDetectedError("Cloudflare interstitial body");
    }
    if (response.status === 403) {
      throw new ChallengeDetectedError(`HTTP 403 — likely bot challenge`);
    }
    if (RETRYABLE_STATUSES.has(response.status)) {
      throw new RetryableHttpError(response.status, url);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    return text;
  }

  // Fetch a JSON endpoint by navigating a real browser page (handles Referer/cookies/CF)
  private async fetchJsonViaBrowser<T>(url: string): Promise<T> {
    const context = await this.getContext();
    const page = await context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: "load", timeout: 30000 });
      this.lastRequestAt = Date.now();
      if (!response || !response.ok()) {
        throw new Error(`HTTP ${response?.status() ?? "?"} fetching JSON from ${url}`);
      }
      // page.content() wraps body in HTML — read raw response body instead
      const text = await response.text();
      return JSON.parse(text) as T;
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }

  abstract scrapeAll(): AsyncGenerator<ScrapedCard>;
}
