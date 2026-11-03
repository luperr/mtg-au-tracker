// Optimiser v2 types. Pure — no Next.js or DB imports, and relative imports only,
// so vitest resolves everything here without path aliases.
//
// All money is integer cents. v1 summed floats, which is how a plan came back as
// $168.66000000000003 and why exact-equality tie-breaks were unreliable.

import type { CardCondition } from "@mtg-au/shared";
import type { StoreListing } from "../store-listing";

export type Cents = number;

export type Finish = StoreListing["finish"];

/**
 * Identifies one listing across scrapes. `store_prices.id` is rewritten by every
 * scrape, so a stored id would point at nothing the next morning.
 */
export type ListingKey = {
  printingId: string;
  storeId: string;
  condition: string | null;
  url: string | null;
};

export type OptimiseLine = {
  /** Client-assigned, unique within a request. */
  lineId: string;
  cardId: string;
  cardName: string;
  qty: number;
  /** "exact" buys only `printingId`; "any" buys any printing that meets the prefs. */
  printing: "exact" | "any";
  /** Required for "exact". For "any" it only marks which printing counts as unchanged. */
  printingId: string | null;
  /** For "any" lines, a finish that overrides `Prefs.finish` (a deck list's `*F*` marker). */
  finish?: Finish | null;
  /** The listing the user has now, with the price they last saw — re-priced server-side. */
  current?: (ListingKey & { seenCents: Cents }) | null;
};

export type Prefs = {
  /** Worst condition accepted. Listings with no or an unrecognised condition pass, flagged. */
  minCondition: CardCondition | "any";
  /** Applies to "any" lines only — an exact printing already fixes its finish. */
  finish: Finish | "any";
  excludeStores: string[];
  includeEbay: boolean;
  /** Most flat-postage stores in the plan. eBay is governed by `includeEbay`, not this. */
  maxStores: number | null;
  /** Per-store postage the user set, e.g. 0 for a store they collect from. */
  postageOverrides: Record<string, Cents>;
};

/**
 * Defaults steer away from v1's silent downgrades: a heavily played copy or a
 * foil never stands in for an "any printing" line unless the user asks for it.
 */
export const DEFAULT_PREFS: Prefs = {
  minCondition: "LP",
  finish: "nonfoil",
  excludeStores: [],
  includeEbay: true,
  maxStores: null,
  postageOverrides: {},
};

export type StoreInfo = {
  storeId: string;
  storeName: string;
  /** Flat postage per order. null = postage is per item (eBay), carried on each offer. */
  flatCents: Cents | null;
  /** Order subtotal (cards only) at which the flat postage is waived. null = never. */
  freeOverCents: Cents | null;
};

/** One in-stock sell listing, in cents, with the stock and cart data the scrapers expose. */
export type Offer = Omit<StoreListing, "priceAud" | "shippingAud"> & {
  priceCents: Cents;
  /** Per-item postage (eBay). Flat-rate stores carry theirs on StoreInfo. */
  shippingCents: Cents | null;
  /** null = the store doesn't say; treated as unlimited and flagged when qty > 1. */
  stockQty: number | null;
  /** Shopify variant id, for cart permalinks. */
  variantId: string | null;
};

export type UnitFlags = {
  printingChanged: boolean;
  conditionChanged: boolean;
  /** No condition, or one outside NM/LP/MP/HP/DMG ("Signed", "GP Stamped"). */
  conditionUnknown: boolean;
  /** More than one copy from a listing whose store doesn't publish stock. */
  stockUnconfirmed: boolean;
};

/** `qty` copies of one line bought from one offer. */
export type PlanUnit = {
  lineId: string;
  cardId: string;
  cardName: string;
  qty: number;
  offer: Offer;
  flags: UnitFlags;
};

export type PlanStore = {
  storeId: string;
  storeName: string;
  /** "flat": one postage charge per order. "per-item": each listing ships separately (eBay). */
  kind: "flat" | "per-item";
  units: PlanUnit[];
  subtotalCents: Cents;
  postageCents: Cents;
  postageWaived: boolean;
  /** How much more to spend here for free postage; null when there's no threshold or it's met. */
  freeShippingGapCents: Cents | null;
};

export type PlanTotals = {
  cardsCents: Cents;
  postageCents: Cents;
  totalCents: Cents;
  /** Flat-rate stores used. */
  storeCount: number;
  /** Separate deliveries: flat-rate stores plus each eBay listing. */
  parcelCount: number;
  unitsWanted: number;
  unitsFilled: number;
};

export type Plan = { stores: PlanStore[]; totals: PlanTotals };

export type Unavailable = {
  lineId: string;
  cardId: string;
  cardName: string;
  /**
   * "no-listings": nothing in stock anywhere. "no-match": in stock, but not in a
   * printing, condition, finish or store the prefs allow. "short": not enough
   * copies — `missing` of them couldn't be filled.
   */
  reason: "no-listings" | "no-match" | "short";
  missing: number;
};

export type Alternative = { storeCount: number; totalCents: Cents; storeIds: string[] };

export type CurrentPlan = {
  /** The user's chosen listings at today's prices, costed exactly like the plan. */
  totals: PlanTotals;
  /** Lines with no chosen listing, or whose listing has sold out or gone. */
  missing: string[];
  repriced: { lineId: string; seenCents: Cents; nowCents: Cents }[];
};

export type OptimiseResponse = {
  plan: Plan;
  alternatives: Alternative[];
  current: CurrentPlan;
  /** Only when the comparison is like for like: every line priced on both sides. */
  savingsCents: Cents | null;
  unavailable: Unavailable[];
  /** True when the search proved this the cheapest plan rather than the best it found in time. */
  proven: boolean;
};
