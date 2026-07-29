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
import { USER_AGENT, PLAIN_FETCH_TIMEOUT_MS } from "../lib/config.js";

const log = logger.child({ component: "base-scraper" });

/** Thrown by the plain-fetch path when the response looks like a bot challenge. */
export class ChallengeDetectedError extends Error {}

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
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
      await this.waitForCloudflare(page);
      const content = await page.content();
      this.lastRequestAt = Date.now();
      return content;
    } finally {
      await page.close();
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

  // Fetch a JSON endpoint. Plain fetch() first (cheap); falls back to a real
  // browser page only if this store turns out to be behind a bot challenge.
  protected async fetchJson<T>(url: string): Promise<T> {
    await this.rateLimit();

    if (!this.useBrowserForJson) {
      try {
        const result = await this.fetchJsonPlain<T>(url);
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
        const html = await this.fetchTextPlain(url, "text/html");
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

  // Plain fetch() with bot-challenge detection. Throws ChallengeDetectedError
  // when the response looks like an interstitial rather than real content.
  private async fetchTextPlain(url: string, accept: string): Promise<string> {
    // Node's fetch() has no default timeout: a server that accepts the
    // connection and then never responds hangs the whole scrape forever.
    // Matches the 30s used on the Playwright paths.
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(PLAIN_FETCH_TIMEOUT_MS),
    });

    if (response.status === 403 || response.status === 503) {
      throw new ChallengeDetectedError(`HTTP ${response.status} — likely bot challenge`);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    const text = await response.text();
    if (text.includes("Just a moment") || text.includes("cf-browser-verification")) {
      throw new ChallengeDetectedError("Cloudflare interstitial body");
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
