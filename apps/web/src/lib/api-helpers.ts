import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils";
import { getClientIp } from "@/lib/request";

const log = logger.child({ component: "api" });

/**
 * Wraps a route handler in a standard try/catch. On error, logs via pino and
 * returns a consistent JSON 500 response. Eliminates boilerplate from every route.
 *
 * Not exported: every route goes through withApiGuard below, which needs the
 * rate-limit check too. Export it if a route ever legitimately needs error
 * handling without rate limiting.
 */
async function withErrorHandler(
  handler: () => Promise<NextResponse>,
  context: string,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (err) {
    log.error({ err, context }, "Unhandled API route error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Combines the rate-limit check + error handling every route needs: rejects
 * with 429 before the handler runs (skipped in development), otherwise runs
 * the handler through withErrorHandler. checkRateLimit is created once per
 * route via createRateLimiter() so its request counts persist across calls.
 */
export async function withApiGuard(
  req: NextRequest,
  checkRateLimit: (ip: string) => boolean,
  context: string,
  handler: (req: NextRequest) => Promise<NextResponse>,
): Promise<NextResponse> {
  const ip = getClientIp(req);
  if (process.env.NODE_ENV !== "development" && !checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return withErrorHandler(() => handler(req), context);
}
