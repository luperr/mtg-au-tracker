/**
 * Types for the scraper system.
 */

/** Raw data extracted from a store page before matching to Scryfall */
export interface ScrapedCard {
  rawName: string;
  setName: string | null;
  price: number;
  priceType: "sell" | "buylist";
  condition: string;
  isFoil: boolean;
  inStock: boolean;
  sourceUrl: string;
}

/** Interface that all store scrapers must implement */
export interface StoreScraper {
  storeId: string;
  storeName: string;

  /** Scrape all available card listings as an async generator */
  scrapeAll(): AsyncGenerator<ScrapedCard>;

  /** Verify the store site is accessible and scrapeable */
  healthCheck(): Promise<boolean>;
}

/** Result of attempting to match a scraped card to a Scryfall printing */
export interface MatchResult {
  scrapedCard: ScrapedCard;
  printingId: string | null;
  matchType: "exact" | "name_only" | "fuzzy" | "unmatched";
  confidence: number;
}
