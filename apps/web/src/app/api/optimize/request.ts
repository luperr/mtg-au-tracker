// Request-body validation for /api/optimize. Pure, like algorithm.ts, so tests can
// import it without path-alias resolution.

import { MAX_BULK_CARDS } from "../../../lib/config";
import type { OptimizeItem } from "./algorithm";

export type OptimizeRequest = {
  items: OptimizeItem[];
  /** Cards locked to their current printing. */
  lockedPrintingIds: Set<string>;
  /** Per-store postage the user edited, AUD. */
  shippingOverrides: Record<string, number>;
};

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * Parses the POST body, or returns an error message for a 400. The body comes from
 * localStorage via the client, so any of it can be stale or hand-edited: a non-string
 * cardId would reach `ANY(${cardIds})` as a 500, and a negative or string override
 * would turn a store's postage into a discount or NaN.
 */
export function parseOptimizeRequest(body: unknown): OptimizeRequest | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Expected a JSON object" };
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { error: "Expected { items: OptimizeItem[] }" };
  }
  if (b.items.length > MAX_BULK_CARDS) {
    return { error: `At most ${MAX_BULK_CARDS} items can be optimised at once` };
  }
  const items: OptimizeItem[] = [];
  for (const raw of b.items) {
    const i = raw as Record<string, unknown> | null;
    if (!i || !isNonEmptyString(i.cardId) || !isNonEmptyString(i.printingId) || typeof i.cardName !== "string") {
      return { error: "Each item needs a cardId, cardName and printingId" };
    }
    items.push({ cardId: i.cardId, cardName: i.cardName, printingId: i.printingId });
  }

  const locked = b.lockedPrintingIds ?? [];
  if (!Array.isArray(locked) || !locked.every(isNonEmptyString)) {
    return { error: "lockedPrintingIds must be an array of strings" };
  }

  const overrides = b.shippingOverrides ?? {};
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    return { error: "shippingOverrides must be an object" };
  }
  const shippingOverrides: Record<string, number> = {};
  for (const [storeId, amount] of Object.entries(overrides)) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      return { error: `Invalid postage override for ${storeId}` };
    }
    shippingOverrides[storeId] = amount;
  }

  return { items, lockedPrintingIds: new Set(locked), shippingOverrides };
}
