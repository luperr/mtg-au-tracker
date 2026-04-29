import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { withErrorHandler } from "@/lib/api-helpers";
import { createRateLimiter } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { CACHE_REVALIDATE_HOUR, CACHE_STALE_WHILE_REVALIDATE_DAY, RATE_LIMIT_READ_PER_MINUTE } from "@/lib/config";

const checkRateLimit = createRateLimiter(RATE_LIMIT_READ_PER_MINUTE, 60 * 1000);

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (process.env.NODE_ENV !== "development" && !checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return withErrorHandler(async () => {
    const rows = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM stores WHERE scraper_enabled = true ORDER BY name
    `;
    return NextResponse.json([...rows], {
      headers: { "Cache-Control": `public, s-maxage=${CACHE_REVALIDATE_HOUR}, stale-while-revalidate=${CACHE_STALE_WHILE_REVALIDATE_DAY}` },
    });
  }, "contact-stores");
}
