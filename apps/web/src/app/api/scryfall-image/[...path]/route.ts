import { NextRequest, NextResponse } from "next/server";
import { withApiGuard } from "@/lib/api-helpers";
import { createRateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_IMAGE_PER_MINUTE, SCRYFALL_IMAGE_ORIGIN, SCRYFALL_USER_AGENT } from "@/lib/config";

const checkRateLimit = createRateLimiter(RATE_LIMIT_IMAGE_PER_MINUTE, 60 * 1000);

/** A Scryfall card-image path and nothing else: size / face / two hash dirs / id.ext. */
const CARD_IMAGE_PATH = /^(small|normal|large|png|art_crop|border_crop)\/(front|back)\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.(jpg|png)$/;

/**
 * Card art from cards.scryfall.io, for the image optimizer to resize (app/CardImage.tsx).
 *
 * It exists because Next's optimizer fetches remote images with Node's default User-Agent and
 * offers no way to set one, and Scryfall rejects that ("generic_user_agent"). Pointed at this
 * local route instead, the optimizer calls it in-process, and this fetches with a real UA.
 * Only Scryfall card-image paths pass, so it can't be used to fetch anything else.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return withApiGuard(req, checkRateLimit, "scryfall-image", async () => {
    const path = (await params).path.join("/");
    if (!CARD_IMAGE_PATH.test(path)) return NextResponse.json({ error: "Not a card image" }, { status: 404 });
    // Scryfall's cache-busting version, e.g. ?1783906382 — digits only.
    const version = req.nextUrl.search.replace(/^\?/, "");
    const upstream = `${SCRYFALL_IMAGE_ORIGIN}/${path}${/^\d+$/.test(version) ? `?${version}` : ""}`;

    const res = await fetch(upstream, {
      headers: { "User-Agent": SCRYFALL_USER_AGENT, Accept: "image/*" },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok || !res.body) return NextResponse.json({ error: "Upstream image unavailable" }, { status: 502 });

    return new NextResponse(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        // Versioned URL, so it never changes.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });
}
