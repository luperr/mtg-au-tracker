import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getStoreShippingRates } from "@/lib/store-shipping";
import { logger } from "@/lib/utils";
import { createRateLimiter } from "@/lib/rate-limit";
import { withApiGuard } from "@/lib/api-helpers";
import { RATE_LIMIT_OPTIMIZE_PER_MINUTE, OPTIMIZE_DEADLINE_MS, OPTIMIZE_EXACT_MAX_STORES } from "@/lib/config";
import { branchAndBound, evaluateSubset, localSearch, dedupeCheapestPerStore } from "./algorithm";
import type { OptimizeItem, Listing } from "./algorithm";
import { mapListingRow, type StoreListing, type StoreListingRow } from "@/lib/store-listing";

export type { OptimizeItem };

const log = logger.child({ component: "api-optimize" });
const checkRateLimit = createRateLimiter(RATE_LIMIT_OPTIMIZE_PER_MINUTE, 60 * 1000);

export type OptimizeAssignment = StoreListing & {
  cardId: string;
  cardName: string;
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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  return withApiGuard(request, checkRateLimit, "optimize", async (request) => {
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
  // lockedPrintingIds: these cards must stay on their current printing
  const lockedPrintingIds = new Set<string>(
    (body as { lockedPrintingIds?: string[] }).lockedPrintingIds ?? []
  );
  // Per-store shipping overrides from the client (user-edited values)
  const shippingOverrides = (body as { shippingOverrides?: Record<string, number> }).shippingOverrides ?? {};
  const storeShippingRates = await getStoreShippingRates();
  const flatRates: Record<string, number | null> = { ...storeShippingRates, ...shippingOverrides };
  if (Object.keys(shippingOverrides).length > 0) {
    log.debug({ shipping_overrides: shippingOverrides }, "Shipping overrides received");
  }

  const cardIds = typedItems.map((i) => i.cardId);

  // Fetch all in-stock sell listings for all cardIds across all stores and printings
  const rows = await sql<(StoreListingRow & { card_id: string })[]>`
    SELECT
      p.id AS printing_id,
      p.card_id,
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
      p.finish,
      p.border_color,
      p.frame_effects,
      p.image_uri
    FROM printings p
    JOIN store_prices sp ON sp.printing_id = p.id
      AND sp.in_stock = true
      AND sp.price_type = 'sell'
    JOIN stores s ON s.id = sp.store_id
    WHERE p.card_id = ANY(${cardIds})
    ORDER BY p.card_id, sp.price_aud::numeric ASC
  `;

  // Build byCard map: cardId → listings
  // For locked cards, only include the locked printingId
  const itemByCardId = new Map(typedItems.map((i) => [i.cardId, i]));
  const byCard = new Map<string, Listing[]>();
  for (const item of typedItems) byCard.set(item.cardId, []);

  for (const row of rows) {
    const item = itemByCardId.get(row.card_id);
    if (!item) continue;

    // If this card is locked to a specific printing, skip other printings
    if (lockedPrintingIds.has(item.printingId) && row.printing_id !== item.printingId) {
      continue;
    }

    const listing: Listing = mapListingRow(row);
    byCard.get(row.card_id)!.push(listing);
  }

  // Sort each card's listings: cheapest first, but current printing breaks ties
  // so the algorithm never swaps to a different printing for zero gain. Then
  // drop everything but the cheapest listing per store — a broad want list can
  // otherwise carry tens of thousands of listings into every subset evaluation.
  for (const [cardId, listings] of byCard.entries()) {
    const currentPrintingId = itemByCardId.get(cardId)!.printingId;
    listings.sort((a, b) => {
      if (a.priceAud !== b.priceAud) return a.priceAud - b.priceAud;
      if (a.printingId === currentPrintingId) return -1;
      if (b.printingId === currentPrintingId) return 1;
      return 0;
    });
    byCard.set(cardId, dedupeCheapestPerStore(listings));
  }

  // Identify cards with no available listings
  const unavailable = typedItems
    .filter((i) => !byCard.get(i.cardId)?.length)
    .map((i) => i.cardName);

  const available = typedItems.filter((i) => (byCard.get(i.cardId)?.length ?? 0) > 0);

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

  // Identify pool store IDs (flat-rate, non-eBay) that appear in any listing
  const allStoreIds = new Set<string>(rows.map((r: { store_id: string }) => r.store_id));
  const allPoolStoreIds = new Set<string>(
    [...allStoreIds].filter((id): id is string => id in storeShippingRates && id !== "ebay_au")
  );

  // Enumerate only pool stores that actually have at least one listing for the requested
  // cards. Price-based pruning is incorrect when flat rates differ across stores (e.g. a
  // $0 collect store is always competitive regardless of per-card price). Bounding by
  // stores-with-listings keeps the search well under the full store roster, but with 30+
  // stores now configured a broad want list can still touch enough of them to make the
  // 2^N subset search slow — OPTIMIZE_DEADLINE_MS below is what actually bounds latency.
  const competitivePoolStores = [...allPoolStoreIds].filter(storeId =>
    [...byCard.values()].some(listings => listings.some(l => l.storeId === storeId))
  );

  // Sort cheapest flat rate first so free/cheap stores are explored early,
  // producing tight upper bounds quickly and maximising B&B pruning.
  const sortedPoolStores = [...competitivePoolStores].sort(
    (a, b) => (flatRates[a] ?? 0) - (flatRates[b] ?? 0)
  );

  // Warm-start B&B by evaluating eBay-only and each single-store solution.
  // This gives a tight initial upper bound so pruning is effective from node 1,
  // rather than waiting until B&B stumbles into a good solution organically.
  const best: { cost: number; assignments: Map<string, Listing> | null } = {
    cost: Infinity,
    assignments: null,
  };
  for (const seed of [new Set<string>(), ...sortedPoolStores.map(s => new Set([s]))]) {
    const r = evaluateSubset(available, byCard, seed, allPoolStoreIds, flatRates);
    if (r && r.cost < best.cost) { best.cost = r.cost; best.assignments = r.assignments; }
  }

  // One wall-clock budget shared by local search and the exact pass.
  const deadline = Date.now() + OPTIMIZE_DEADLINE_MS;

  // Local search from the best seed's store set — near-optimal in milliseconds,
  // giving B&B a tight upper bound so pruning is effective even at 30+ stores.
  const initialActive = new Set<string>(
    best.assignments
      ? [...best.assignments.values()].map(l => l.storeId).filter(id => allPoolStoreIds.has(id))
      : []
  );
  const ls = localSearch(available, byCard, initialActive, sortedPoolStores, allPoolStoreIds, flatRates, deadline);
  if (ls && ls.cost < best.cost) { best.cost = ls.cost; best.assignments = ls.assignments; }

  // Exact prove-or-improve pass. Skipped outright when the store count makes
  // finishing hopeless (2^N nodes) — measured runs at N≈30 never improve on
  // local search, they just burn the full deadline.
  if (sortedPoolStores.length <= OPTIMIZE_EXACT_MAX_STORES) {
    const completed = branchAndBound(
      {
        stores: sortedPoolStores,
        available,
        byCard,
        allPoolStoreIds,
        flatRates,
        best,
        deadline,
        rank: new Map(sortedPoolStores.map((s, i) => [s, i])),
      },
      0,
      new Set<string>(),
    );

    if (!completed) {
      log.warn(
        { pool_stores: sortedPoolStores.length, item_count: available.length, cost: best.cost },
        "Optimiser hit its deadline — returning best plan found so far",
      );
    }
  } else {
    log.debug(
      { pool_stores: sortedPoolStores.length, item_count: available.length, cost: best.cost },
      "Exact search skipped (store count too large) — using local-search plan",
    );
  }

  if (best.assignments) {
    const usedStores = new Set([...best.assignments.values()].map(l => l.storeId));
    log.debug({ stores: [...usedStores], total_cost: best.cost, item_count: available.length }, "Optimiser result");
  }

  if (!best.assignments) {
    log.error({ item_count: available.length }, "Optimiser could not find valid assignment");
    return NextResponse.json({ error: "Could not find valid assignment" }, { status: 500 });
  }

  // Build response — look up by cardId; printingId comes from the chosen listing
  const assignments: OptimizeAssignment[] = available.map((item) => {
    const listing = best.assignments!.get(item.cardId)!;
    return { ...listing, cardId: item.cardId, cardName: item.cardName };
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
  const storeBreakdown = Array.from(storeGroups.values()).map(({ storeName, storeId, items: storeItems }) => {
    const cardsTotal = storeItems.reduce((s, i) => s + i.priceAud, 0);
    const isPool = storeId in storeShippingRates && storeId !== "ebay_au";
    let shipping: number | null;
    if (isPool) {
      shipping = flatRates[storeId] ?? null;
    } else {
      shipping = storeItems.reduce((s, i) => s + (i.shippingAud ?? 0), 0);
    }
    totalPostage += shipping ?? 0;
    return {
      storeName,
      storeId,
      itemCount: storeItems.length,
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
  });
}
