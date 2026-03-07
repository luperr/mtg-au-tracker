/**
 * Shared scraper types — used by both the scraper service and (eventually) the web UI.
 */

// Raw data extracted from a store page before it's matched to a Scryfall printing.
export interface ScrapedCard {
  rawName: string;
  setCode: string | null;        // Scryfall set code if the store provides it (e.g. "dmu")
  setName: string | null;        // Human-readable set name if available
  collectorNumber: string | null; // Collector number if the store provides it (e.g. "149")
  price: string;                 // AUD as decimal string e.g. "8.00"
  priceType: "sell" | "buylist";
  condition: string | null;      // "NM", "LP", "MP", "HP", "DMG"
  isFoil: boolean;
  inStock: boolean;
  sourceUrl: string;             // Full URL to the product page
}

// Interface all store scrapers must implement.
export interface StoreScraper {
  scrapeAll(): AsyncGenerator<ScrapedCard>;
  healthCheck(): Promise<boolean>;
}
