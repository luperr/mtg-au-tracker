/**
 * Core card types derived from Scryfall data model.
 *
 * "Card" = the abstract game object (e.g. Lightning Bolt).
 * "Printing" = a specific physical version (e.g. Lightning Bolt from M11, foil).
 */

export interface Card {
  /** Scryfall oracle_id — unique per game object */
  id: string;
  name: string;
  nameNormalized: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string | null;
  colors: string[];
  colorIdentity: string[];
  /** Format legalities as a JSON object, e.g. { standard: "legal", modern: "legal" } */
  legalities: Record<string, string>;
  updatedAt: Date;
}

export interface Printing {
  /** Scryfall card ID — unique per printing */
  id: string;
  /** FK to Card.id (oracle_id) */
  cardId: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";
  isFoil: boolean;
  imageUri: string | null;
  scryfallUri: string;
  /** Scryfall USD market price */
  usdPrice: number | null;
  /** Scryfall EUR market price */
  eurPrice: number | null;
  updatedAt: Date;
}

export interface StorePrice {
  id: number;
  printingId: string;
  storeId: string;
  priceType: "sell" | "buylist";
  priceAud: number;
  condition: string;
  inStock: boolean;
  sourceUrl: string;
  scrapedAt: Date;
}

export interface PriceHistory {
  id: number;
  printingId: string;
  storeId: string;
  priceType: "sell" | "buylist";
  priceAud: number;
  recordedDate: Date;
}

export interface Store {
  id: string;
  name: string;
  url: string;
  scraperEnabled: boolean;
  supportsBuylist: boolean;
}

/**
 * The combined view returned by the card detail API.
 * One card with all its printings and their AU store prices.
 */
export interface CardDetail {
  card: Card;
  printings: PrintingWithPrices[];
  /** Calculated median AU sell price across all stores and printings */
  audMarketPrice: number | null;
}

export interface PrintingWithPrices extends Printing {
  storePrices: (StorePrice & { storeName: string })[];
}
