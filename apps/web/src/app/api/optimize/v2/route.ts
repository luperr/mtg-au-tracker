import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getStoreShippingRates } from "@/lib/store-shipping";
import { logger } from "@/lib/utils";
import { createRateLimiter } from "@/lib/rate-limit";
import { withApiGuard } from "@/lib/api-helpers";
import {
  RATE_LIMIT_OPTIMIZE_V2_PER_MINUTE, OPTIMIZE_DEADLINE_MS, OPTIMIZE_EXACT_MAX_STORES, OPTIMIZE_ALTERNATIVES_MS,
} from "@/lib/config";
import { parseOptimiseRequest } from "@/lib/optimiser/request";
import { buildProblem, offerFromRow, toCents, type OfferRow } from "@/lib/optimiser/problem";
import { alternatives, solve } from "@/lib/optimiser/search";
import { buildResponse } from "@/lib/optimiser/plan";
import type { Offer, StoreInfo } from "@/lib/optimiser/types";

const log = logger.child({ component: "api-optimize" });
const checkRateLimit = createRateLimiter(RATE_LIMIT_OPTIMIZE_V2_PER_MINUTE, 60 * 1000);

/** Above this, a run logs at warn — the same bar v1 and search v2 use. */
const SLOW_OPTIMIZE_MS = 2000;

export async function POST(request: NextRequest) {
  return withApiGuard(request, checkRateLimit, "optimize-v2", async (request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = parseOptimiseRequest(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { lines, prefs } = parsed;
    const cardIds = [...new Set(lines.map((l) => l.cardId))];

    // Every in-stock listing for the cards, eligible or not: prefs are applied in
    // buildProblem, because the current plan is re-priced from the same rows and
    // a user's current listing can sit at a store their prefs now exclude.
    // store_prices has no stock or variant column yet; both read as unknown.
    const started = performance.now();
    const [rows, rates] = await Promise.all([
      sql<OfferRow[]>`
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
          p.image_uri,
          NULL::int AS stock_qty,
          NULL::text AS variant_id
        FROM printings p
        JOIN store_prices sp ON sp.printing_id = p.id
          AND sp.in_stock = true
          AND sp.price_type = 'sell'
        JOIN stores s ON s.id = sp.store_id AND s.scraper_enabled = true
        WHERE p.card_id = ANY(${cardIds})
      `,
      getStoreShippingRates(),
    ]);
    const sqlMs = Math.round(performance.now() - started);

    const offersByCard = new Map<string, Offer[]>();
    const storeNames = new Map<string, string>();
    for (const row of rows) {
      const offers = offersByCard.get(row.card_id) ?? [];
      offers.push(offerFromRow(row));
      offersByCard.set(row.card_id, offers);
      storeNames.set(row.store_id, row.store_name);
    }
    const stores: StoreInfo[] = [...storeNames].map(([storeId, storeName]) => {
      const flat = rates[storeId];
      return { storeId, storeName, flatCents: flat == null ? null : toCents(flat), freeOverCents: null };
    });

    const problem = buildProblem(lines, offersByCard, stores, prefs);
    const opts = { exactMaxStores: OPTIMIZE_EXACT_MAX_STORES };
    const result = solve(problem, { ...opts, maxOpen: prefs.maxStores ?? Infinity, deadline: Date.now() + OPTIMIZE_DEADLINE_MS });
    const alts = alternatives(problem, result.best, { ...opts, deadline: Date.now() + OPTIMIZE_ALTERNATIVES_MS });
    const response = buildResponse({ lines, offersByCard, prefs, problem, result, alternatives: alts });

    // Grafana: component="api-optimize", version=2. Same fields as v1's summary,
    // so the two can be compared on one panel.
    const solveMs = Math.round(performance.now() - started) - sqlMs;
    const summary = {
      version: 2,
      items: lines.length,
      units: response.plan.totals.unitsWanted,
      available: problem.lines.length,
      rows: rows.length,
      pool_stores: problem.pool.length,
      max_stores: prefs.maxStores,
      exact: result.exact,
      completed: result.completed,
      alternatives: alts.length,
      sql_ms: sqlMs,
      solve_ms: solveMs,
      ms: sqlMs + solveMs,
      stores_used: result.best.storesUsed,
    };
    if (summary.ms > SLOW_OPTIMIZE_MS) log.warn(summary, "slow optimiser run");
    else log.info(summary, "optimiser run");

    return NextResponse.json(response);
  });
}
