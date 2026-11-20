import { NextRequest, NextResponse } from "next/server";
import { withApiGuard } from "@/lib/api-helpers";
import { createRateLimiter } from "@/lib/rate-limit";
import { CACHE_REVALIDATE_HOUR, CACHE_STALE_WHILE_REVALIDATE_DAY, RATE_LIMIT_READ_PER_MINUTE } from "@/lib/config";
import { getSetFamilies } from "@/lib/sets";

const checkRateLimit = createRateLimiter(RATE_LIMIT_READ_PER_MINUTE, 60 * 1000);

/** Set families (a main set and its sub-sets), newest first — the want list's exclude-sets picker. */
export async function GET(req: NextRequest) {
  return withApiGuard(req, checkRateLimit, "sets", async () => {
    return NextResponse.json(await getSetFamilies(), {
      headers: { "Cache-Control": `public, s-maxage=${CACHE_REVALIDATE_HOUR}, stale-while-revalidate=${CACHE_STALE_WHILE_REVALIDATE_DAY}` },
    });
  });
}
