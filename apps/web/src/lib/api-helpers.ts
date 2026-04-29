import { NextResponse } from "next/server";
import { logger } from "@/lib/utils";

const log = logger.child({ component: "api" });

/**
 * Wraps a route handler in a standard try/catch. On error, logs via pino and
 * returns a consistent JSON 500 response. Eliminates boilerplate from every route.
 */
export async function withErrorHandler(
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
