import sql, { searchCards, PAGE_SIZE } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Rate limit: 60 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 1000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (process.env.NODE_ENV !== "development" && !checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const offset = Math.max(0, Math.min(parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10), 10000));

  if (!q) return NextResponse.json({ results: [], hasMore: false });

  // Log the search query to DB on the first page only (offset=0 = new search, not pagination)
  if (offset === 0) {
    sql`INSERT INTO card_searches (query) VALUES (${q})`.execute().catch(() => {});
  }

  try {
    const results = await searchCards(q, offset);
    return NextResponse.json(
      { results, hasMore: results.length === PAGE_SIZE },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
