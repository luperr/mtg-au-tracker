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
  finish?: "nonfoil" | "foil" | "etched"; // more specific than isFoil; undefined = derive from isFoil
  treatment?: string;            // canonical variant: "borderless" | "showcase" | "extendedart" | "fullart"
  inStock: boolean;
  sourceUrl: string;             // Full URL to the product page
  shippingCost?: string | null;  // AUD shipping cost as decimal string, "0.00" for free, null if unknown
}

// Interface all store scrapers must implement.
export interface StoreScraper {
  scrapeAll(): AsyncGenerator<ScrapedCard>;
}
