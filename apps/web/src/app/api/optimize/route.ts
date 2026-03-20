import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { STORE_FLAT_SHIPPING_AUD } from "@/lib/store-shipping";

// ── Types ─────────────────────────────────────────────────────────────────────

type OptimizeItem = {
  cardId: string;
  cardName: string;
  printingId: string;
};

type Listing = {
  printingId: string;
  storeId: string;
  storeName: string;
  priceAud: number;
  shippingAud: number | null;
  condition: string | null;
  url: string | null;
  setName: string;
  setCode: string;
  rarity: string;
  isFoil: boolean;
  imageUri: string | null;
};

export type OptimizeAssignment = {
  cardId: string;
  cardName: string;
  printingId: string;
  storeId: string;
  storeName: string;
  priceAud: number;
  shippingAud: number | null;
  condition: string | null;
  url: string | null;
  setName: string;
  setCode: string;
  rarity: string;
  isFoil: boolean;
  imageUri: string | null;
};

export type OptimizeResult = {
  assignments: OptimizeAssignment[];
  totalCards: number;
  totalPostage: number;
  totalCost: number;
  storeBreakdown: {
    storeName: string;
    storeId: string;
    itemCount: number;
    cardsTotal: number;
    shipping: number | null;
    storeTotal: number;
  }[];
  unavailable: string[]; // card names with no listings
};

// ── Optimization logic ────────────────────────────────────────────────────────

/**
 * Evaluate one combination of pool stores.
 *
 * Pool stores (Good Games, MTG Mate) charge a flat shipping fee per order.
 * All other stores (eBay) charge per-listing shipping.
 *
 * For a given set of active pool stores, each card is assigned to the
 * cheapest available listing, where pool-store items don't pay per-card
 * shipping (it's amortised). Flat shipping is added once per used pool store.
 */
function evaluateSubset(
  items: OptimizeItem[],
  byPrinting: Map<string, Listing[]>,
  activePoolStoreIds: Set<string>
): { cost: number; assignments: Map<string, Listing> } | null {
  const assignments = new Map<string, Listing>(); // printingId → chosen listing

  for (const item of items) {
    const listings = byPrinting.get(item.printingId);
    if (!listings || listings.length === 0) return null; // unavailable

    let best: Listing | null = null;
    let bestCost = Infinity;

    for (const l of listings) {
      // Effective marginal cost of this listing in this subset:
      // - Pool stores in active set: just card price (shipping shared later)
      // - Everything else: card price + per-listing shipping
      const isPoolInSubset = activePoolStoreIds.has(l.storeId);
      const effectiveCost = isPoolInSubset
        ? l.priceAud
        : l.priceAud + (l.shippingAud ?? 0);

      if (effectiveCost < bestCost) {
        bestCost = effectiveCost;
        best = l;
      }
    }

    if (!best) return null;
    assignments.set(item.printingId, best);
  }

  // Calculate true total: card prices + shipping
  const usedPoolStores = new Set<string>();
  let totalCost = 0;

  for (const listing of assignments.values()) {
    totalCost += listing.priceAud;
    if (activePoolStoreIds.has(listing.storeId)) {
      usedPoolStores.add(listing.storeId);
    } else {
      // Per-listing shipping (eBay etc.)
      totalCost += listing.shippingAud ?? 0;
    }
  }

  // Add flat shipping for each pool store used in this assignment
  for (const storeId of usedPoolStores) {
    const flat = STORE_FLAT_SHIPPING_AUD[storeId];
    totalCost += flat ?? 0;
  }

  return { cost: totalCost, assignments };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Expected { items: OptimizeItem[] }" }, { status: 400 });
  }

  const typedItems = items as OptimizeItem[];
  const printingIds = typedItems.map((i) => i.printingId);

  // Fetch all in-stock listings for the requested printings
  const rows = await sql<{
    printing_id: string;
    store_id: string;
    store_name: string;
    price_aud: string;
    shipping_aud: string | null;
    condition: string | null;
    url: string | null;
    set_name: string;
    set_code: string;
    rarity: string;
    is_foil: boolean;
    image_uri: string | null;
  }[]>`
    SELECT
      p.id AS printing_id,
      sp.store_id,
      s.name AS store_name,
      sp.price_aud,
      sp.shipping_aud,
      sp.condition,
      sp.url,
      p.set_name,
      p.set_code,
      p.rarity,
      p.is_foil,
      p.image_uri
    FROM printings p
    JOIN store_prices sp ON sp.printing_id = p.id
      AND sp.in_stock = true
      AND sp.price_type = 'sell'
    JOIN stores s ON s.id = sp.store_id
    WHERE p.id = ANY(${printingIds})
    ORDER BY p.id, sp.price_aud::numeric ASC
  `;

  // Group listings by printing_id
  const byPrinting = new Map<string, Listing[]>();
  for (const row of rows) {
    const listing: Listing = {
      printingId: row.printing_id,
      storeId: row.store_id,
      storeName: row.store_name,
      priceAud: parseFloat(row.price_aud),
      shippingAud: row.shipping_aud ? parseFloat(row.shipping_aud) : null,
      condition: row.condition,
      url: row.url,
      setName: row.set_name,
      setCode: row.set_code,
      rarity: row.rarity,
      isFoil: row.is_foil,
      imageUri: row.image_uri,
    };
    if (!byPrinting.has(row.printing_id)) byPrinting.set(row.printing_id, []);
    byPrinting.get(row.printing_id)!.push(listing);
  }

  // Identify cards with no available listings
  const unavailable = typedItems
    .filter((i) => !byPrinting.has(i.printingId))
    .map((i) => i.cardName);

  // Items that can be optimised (have at least one listing)
  const available = typedItems.filter((i) => byPrinting.has(i.printingId));

  if (available.length === 0) {
    return NextResponse.json({
      assignments: [],
      totalCards: 0,
      totalPostage: 0,
      totalCost: 0,
      storeBreakdown: [],
      unavailable,
    } satisfies OptimizeResult);
  }

  // Identify pool store IDs (flat-rate, non-eBay stores that appear in listings)
  const allStoreIds = new Set(rows.map((r) => r.store_id));
  const poolStoreIds = [...allStoreIds].filter(
    (id) => id in STORE_FLAT_SHIPPING_AUD && id !== "ebay_au"
  );

  // Enumerate all subsets of pool stores (2^N where N is typically 2)
  let bestCost = Infinity;
  let bestAssignments: Map<string, Listing> | null = null;

  for (let mask = 0; mask < 1 << poolStoreIds.length; mask++) {
    const activeSet = new Set(poolStoreIds.filter((_, i) => mask & (1 << i)));
    const result = evaluateSubset(available, byPrinting, activeSet);
    if (result && result.cost < bestCost) {
      bestCost = result.cost;
      bestAssignments = result.assignments;
    }
  }

  if (!bestAssignments) {
    return NextResponse.json({ error: "Could not find valid assignment" }, { status: 500 });
  }

  // Build response
  const assignments: OptimizeAssignment[] = available.map((item) => {
    const listing = bestAssignments!.get(item.printingId)!;
    return {
      cardId: item.cardId,
      cardName: item.cardName,
      printingId: item.printingId,
      storeId: listing.storeId,
      storeName: listing.storeName,
      priceAud: listing.priceAud,
      shippingAud: listing.shippingAud,
      condition: listing.condition,
      url: listing.url,
      setName: listing.setName,
      setCode: listing.setCode,
      rarity: listing.rarity,
      isFoil: listing.isFoil,
      imageUri: listing.imageUri,
    };
  });

  // Build per-store breakdown
  const storeGroups = new Map<string, { storeName: string; storeId: string; items: OptimizeAssignment[] }>();
  for (const a of assignments) {
    if (!storeGroups.has(a.storeId)) {
      storeGroups.set(a.storeId, { storeName: a.storeName, storeId: a.storeId, items: [] });
    }
    storeGroups.get(a.storeId)!.items.push(a);
  }

  let totalPostage = 0;
  const storeBreakdown = Array.from(storeGroups.values()).map(({ storeName, storeId, items }) => {
    const cardsTotal = items.reduce((s, i) => s + i.priceAud, 0);
    const isPool = storeId in STORE_FLAT_SHIPPING_AUD && storeId !== "ebay_au";
    let shipping: number | null;
    if (isPool) {
      shipping = STORE_FLAT_SHIPPING_AUD[storeId] ?? null;
    } else {
      // eBay: sum per-item shipping
      shipping = items.reduce((s, i) => s + (i.shippingAud ?? 0), 0);
    }
    totalPostage += shipping ?? 0;
    return {
      storeName,
      storeId,
      itemCount: items.length,
      cardsTotal,
      shipping,
      storeTotal: cardsTotal + (shipping ?? 0),
    };
  });

  const totalCards = assignments.reduce((s, a) => s + a.priceAud, 0);

  return NextResponse.json({
    assignments,
    totalCards,
    totalPostage,
    totalCost: totalCards + totalPostage,
    storeBreakdown,
    unavailable,
  } satisfies OptimizeResult);
}
