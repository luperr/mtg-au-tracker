import { NextRequest, NextResponse } from "next/server";
import { getEnabledStores } from "@/lib/store-shipping";
import { withApiGuard } from "@/lib/api-helpers";
import { createRateLimiter } from "@/lib/rate-limit";
import { CACHE_REVALIDATE_HOUR, CACHE_STALE_WHILE_REVALIDATE_DAY, RATE_LIMIT_READ_PER_MINUTE } from "@/lib/config";

const checkRateLimit = createRateLimiter(RATE_LIMIT_READ_PER_MINUTE, 60 * 1000);

export async function GET(req: NextRequest) {
  return withApiGuard(req, checkRateLimit, "contact-stores", async () => {
    // The same cached read of `stores` the want list and optimiser use.
    const stores = (await getEnabledStores()).map(({ id, name }) => ({ id, name }));
    return NextResponse.json(stores, {
      headers: { "Cache-Control": `public, s-maxage=${CACHE_REVALIDATE_HOUR}, stale-while-revalidate=${CACHE_STALE_WHILE_REVALIDATE_DAY}` },
    });
  });
}
