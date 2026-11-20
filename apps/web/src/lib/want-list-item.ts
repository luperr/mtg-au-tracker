// The want-list item: a card the user wants plus the listing it's bought from.
// Plain module — read by the React context (app/WantListContext.tsx) and by the
// optimiser bridge (lib/optimiser/want-list.ts), which must not import from app/.

export interface WantListItem {
  id: string;         // `${printingId}-${storeId}-${url ?? ""}` — unique per distinct listing
  cardId: string;
  cardSlug: string | null;
  cardName: string;
  printingId: string;
  setName: string;
  setCode: string;
  rarity: string;
  isFoil: boolean;
  finish?: "nonfoil" | "foil" | "etched";   // optional: older localStorage items won't have this
  borderColor?: string | null;               // for variant badge display
  frameEffects?: string[];                   // for variant badge display
  storeId: string;
  storeName: string;
  priceAud: number;
  shippingAud: number | null;
  condition: string | null;
  url: string | null;
  imageUri: string | null;
  /** Copies wanted. Absent = 1. */
  qty?: number;
  /**
   * "exact": this printing only. "any": any printing will do — the optimiser may
   * swap it, and flags it when it does. Absent = "any".
   */
  printingMode?: "exact" | "any";
}

/** The fields of a WantListItem that come from a specific store listing, as opposed to the card. */
export type WantListListing = {
  printingId: string;
  setName: string;
  setCode: string;
  rarity: string;
  isFoil: boolean;
  finish?: "nonfoil" | "foil" | "etched";
  borderColor?: string | null;
  frameEffects?: string[];
  storeId: string;
  storeName: string;
  priceAud: number;
  shippingAud: number | null;
  condition: string | null;
  url: string | null;
  imageUri: string | null;
};

/** The fields of a WantListItem that identify the card, independent of which listing was picked. */
export type WantListCard = {
  cardId: string;
  cardSlug: string | null;
  cardName: string;
};

/** The id recipe for a distinct listing — unique per printing/store/URL combination. */
export function wantListItemId(printingId: string, storeId: string, url: string | null): string {
  return `${printingId}-${storeId}-${url ?? ""}`;
}

/**
 * Builds a WantListItem from a listing + card pair, owning the id recipe in
 * exactly one place. Every caller says whether the card is locked to this
 * printing: a card-level add (search results) leaves it "any", a printing-level
 * one (a price row, a printing tile) locks it "exact".
 */
export function toWantListItem(
  listing: WantListListing,
  card: WantListCard,
  want: { printingMode: "exact" | "any"; qty?: number },
): WantListItem {
  return {
    cardId: card.cardId,
    cardSlug: card.cardSlug,
    cardName: card.cardName,
    ...listing,
    id: wantListItemId(listing.printingId, listing.storeId, listing.url),
    printingMode: want.printingMode,
    ...(want.qty !== undefined ? { qty: want.qty } : {}),
  };
}
