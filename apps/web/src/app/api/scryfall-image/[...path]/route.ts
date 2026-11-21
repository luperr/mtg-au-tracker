import { NextRequest, NextResponse } from "next/server";
import { withApiGuard } from "@/lib/api-helpers";
import { createRateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_IMAGE_PER_MINUTE, SCRYFALL_IMAGE_ORIGIN, SCRYFALL_USER_AGENT } from "@/lib/config";
import { CARD_IMAGE_PATH } from "@/lib/card-image";

const checkRateLimit = createRateLimiter(RATE_LIMIT_IMAGE_PER_MINUTE, 60 * 1000);

/**
 * Upstream misses (a stale image_uri, a Scryfall outage) remembered briefly, so every view of a
 * broken image doesn't re-fetch it — the optimizer never caches a failure. Bounded.
 */
const FAILED_TTL_MS = 10 * 60 * 1000;
const FAILED_MAX = 2000;
const failed = new Map<string, { status: number; until: number }>();

function remember(url: string, status: number) {
  if (failed.size >= FAILED_MAX) failed.delete(failed.keys().next().value!);
  failed.set(url, { status, until: Date.now() + FAILED_TTL_MS });
}

/**
 * Card art from cards.scryfall.io, for the image optimizer to resize (app/CardImage.tsx).
 *
 * It exists because Next's optimizer fetches remote images with Node's default User-Agent and
 * offers no way to set one, and Scryfall rejects that ("generic_user_agent"). Pointed at this
 * local route instead, the optimizer calls it in-process, and this fetches with a real UA.
 * Only Scryfall card-image paths pass, so it can't be used to fetch anything else.
 *
 * Rate-limited only for outside callers. The optimizer's in-process request carries none of the
 * viewer's headers — no cf-connecting-ip — so limiting it would put every viewer in one bucket
 * and break images site-wide on a busy minute. Every real request arrives through Cloudflare,
 * which always sets cf-connecting-ip.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const external = req.headers.has("cf-connecting-ip");
  return withApiGuard(req, (ip) => !external || checkRateLimit(ip), "scryfall-image", async () => {
    const path = (await params).path.join("/");
    if (!CARD_IMAGE_PATH.test(path)) return NextResponse.json({ error: "Not a card image" }, { status: 404 });
    // Scryfall's cache-busting version, e.g. ?1783906382 — digits only.
    const version = req.nextUrl.search.replace(/^\?/, "");
    const upstream = `${SCRYFALL_IMAGE_ORIGIN}/${path}${/^\d+$/.test(version) ? `?${version}` : ""}`;

    const miss = failed.get(upstream);
    if (miss && miss.until > Date.now()) return new NextResponse(null, { status: miss.status });

    let res: Response;
    try {
      res = await fetch(upstream, {
        headers: { "User-Agent": SCRYFALL_USER_AGENT, Accept: "image/*" },
        signal: AbortSignal.timeout(7000),
      });
    } catch {
      // Timeout or network error: Scryfall is slow or down. Quietly — one log per image would
      // flood Loki during an incident.
      remember(upstream, 504);
      return new NextResponse(null, { status: 504 });
    }
    if (!res.ok || !res.body) {
      const status = res.status === 404 ? 404 : 502;
      remember(upstream, status);
      return new NextResponse(null, { status });
    }

    return new NextResponse(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        // Only the optimizer reads this; its own minimumCacheTTL sets how long the resized copy lives.
        "Cache-Control": "public, max-age=86400",
      },
    });
  });
}
