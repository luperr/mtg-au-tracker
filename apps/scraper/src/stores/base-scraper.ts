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
 *   - fetchJson<T>(url)                — fetch a JSON endpoint using the browser's
 *                                        existing session/cookies (no page rendering)
 *   - healthCheck()                    — returns true if the base URL loads
 *   - close()                          — shuts down the browser when scraping is done
 *
 * All methods share one Browser + BrowserContext (opened lazily, closed via close()).
 * Rate-limited to 500ms between requests (sequential) — concurrent scrapers manage
 * their own pacing via concurrency limits rather than this global timer.
 */

import { chromium, type Browser, type BrowserContext } from "playwright";
import type { ScrapedCard, StoreScraper } from "@mtg-au/shared";

const USER_AGENT =
  process.env.USER_AGENT ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0";

export abstract class BaseScraper implements StoreScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private lastRequestAt = 0;
  private readonly rateLimitMs = 500;

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
        console.warn("[BaseScraper] Cloudflare challenge may not have cleared");
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
        console.warn(`[BaseScraper] Selector "${selector}" not found at ${url}`);
      });
      const content = await page.content();
      this.lastRequestAt = Date.now();
      return content;
    } finally {
      await page.close();
    }
  }

  // Fetch a JSON endpoint by navigating a real browser page (handles Referer/cookies/CF)
  protected async fetchJson<T>(url: string): Promise<T> {
    await this.rateLimit();
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

  async healthCheck(): Promise<boolean> {
    try {
      const html = await this.fetchPage(this.getBaseUrl());
      return html.length > 1000;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }

  abstract scrapeAll(): AsyncGenerator<ScrapedCard>;
  abstract getBaseUrl(): string;
}
