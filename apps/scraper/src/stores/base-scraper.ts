import type { ScrapedCard, StoreScraper } from "@mtg-au/shared";

const USER_AGENT = process.env.USER_AGENT ?? "MTGAUTracker/1.0";

/**
 * Base class for all AU store scrapers.
 * Provides common HTTP fetching with rate limiting and error handling.
 */
export abstract class BaseScraper implements StoreScraper {
  abstract storeId: string;
  abstract storeName: string;

  /** Delay between HTTP requests in ms to be respectful */
  protected requestDelay = 1000;

  /** Fetch a URL with our user agent and rate limiting */
  protected async fetchPage(url: string): Promise<string> {
    await this.sleep(this.requestDelay);

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(
        `${this.storeName}: HTTP ${response.status} fetching ${url}`
      );
    }

    return response.text();
  }

  /** Sleep for a given number of milliseconds */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Health check — verify the store's homepage is accessible */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.getBaseUrl(), {
        method: "HEAD",
        headers: { "User-Agent": USER_AGENT },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Subclasses must provide the base URL for health checks */
  protected abstract getBaseUrl(): string;

  /** Subclasses implement the actual scraping logic */
  abstract scrapeAll(): AsyncGenerator<ScrapedCard>;
}
