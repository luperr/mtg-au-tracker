/**
 * Request utilities for API routes.
 */

import { NextRequest } from "next/server";

/** Extract the client IP from a Next.js request, checking proxy headers. */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
