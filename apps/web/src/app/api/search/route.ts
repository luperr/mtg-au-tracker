import sql, { searchCards, PAGE_SIZE } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { withApiGuard } from "@/lib/api-helpers";
import { RATE_LIMIT_SEARCH_PER_MINUTE, MAX_SEARCH_OFFSET, CACHE_SEARCH_MAX_AGE, CACHE_SEARCH_SWR } from "@/lib/config";

const checkRateLimit = createRateLimiter(RATE_LIMIT_SEARCH_PER_MINUTE, 60 * 1000);

export async function GET(req: NextRequest) {
  return withApiGuard(req, checkRateLimit, "search", async (req) => {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const offset = Math.max(0, Math.min(parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10), MAX_SEARCH_OFFSET));

    if (!q) return NextResponse.json({ results: [], hasMore: false });

    const results = await searchCards(q, offset);

    // Log the search query to DB on the first page only (offset=0 = new search, not pagination).
    // Top result's card ID is stored so demand-gap reports can join against store inventory.
    if (offset === 0) {
      const topCardId = results[0]?.id ?? null;
      sql`INSERT INTO card_searches (query, card_id) VALUES (${q}, ${topCardId})`.execute().catch(() => {});
    }

    return NextResponse.json(
      { results, hasMore: results.length === PAGE_SIZE },
      { headers: { "Cache-Control": `public, s-maxage=${CACHE_SEARCH_MAX_AGE}, stale-while-revalidate=${CACHE_SEARCH_SWR}` } }
    );
  });
}
