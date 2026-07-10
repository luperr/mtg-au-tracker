import { NextRequest, NextResponse } from "next/server";
import { getTopMovers } from "@/lib/db";
import { withApiGuard } from "@/lib/api-helpers";
import { createRateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_READ_PER_MINUTE } from "@/lib/config";

export const revalidate = 3600;

const checkRateLimit = createRateLimiter(RATE_LIMIT_READ_PER_MINUTE, 60 * 1000);

export async function GET(req: NextRequest) {
  return withApiGuard(req, checkRateLimit, "top-movers", async (req) => {
    const { searchParams } = req.nextUrl;
    const days = parseInt(searchParams.get("days") ?? "7", 10);
    if (days !== 7 && days !== 14 && days !== 30) {
      return NextResponse.json({ error: "days must be 7, 14, or 30" }, { status: 400 });
    }
    const movers = await getTopMovers(days);
    return NextResponse.json(movers);
  });
}
