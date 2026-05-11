import { NextRequest, NextResponse } from "next/server";
import { getTopMovers } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-helpers";
import { createRateLimiter } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { RATE_LIMIT_READ_PER_MINUTE } from "@/lib/config";

export const revalidate = 3600;

const checkRateLimit = createRateLimiter(RATE_LIMIT_READ_PER_MINUTE, 60 * 1000);

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (process.env.NODE_ENV !== "development" && !checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = req.nextUrl;
  const days = parseInt(searchParams.get("days") ?? "7", 10);
  if (days !== 7 && days !== 14 && days !== 30) {
    return NextResponse.json({ error: "days must be 7, 14, or 30" }, { status: 400 });
  }
  return withErrorHandler(async () => {
    const movers = await getTopMovers(days);
    return NextResponse.json(movers);
  }, "top-movers");
}
