import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { withApiGuard } from "@/lib/api-helpers";
import { createRateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_READ_PER_MINUTE } from "@/lib/config";
import { mapListingRow, type StoreListingRow } from "@/lib/store-listing";

const checkRateLimit = createRateLimiter(RATE_LIMIT_READ_PER_MINUTE, 60 * 1000);

export async function GET(req: NextRequest) {
  return withApiGuard(req, checkRateLimit, "store-printings", async (req) => {
    const cardId = req.nextUrl.searchParams.get("cardId");

    if (!cardId) {
      return NextResponse.json({ error: "cardId required" }, { status: 400 });
    }

    const rows = await sql<(StoreListingRow & { collector_number: string })[]>`
      SELECT DISTINCT ON (p.id, sp.store_id)
        p.id AS printing_id,
        p.set_name,
        p.set_code,
        p.collector_number,
        p.rarity,
        p.is_foil,
        p.finish,
        p.border_color,
        p.frame_effects,
        p.image_uri,
        sp.price_aud,
        sp.shipping_aud,
        sp.condition,
        sp.url,
        sp.store_id,
        s.name AS store_name
      FROM printings p
      JOIN store_prices sp ON sp.printing_id = p.id
      JOIN stores s ON s.id = sp.store_id
      WHERE p.card_id = ${cardId}
        AND sp.in_stock = true
        AND sp.price_type = 'sell'
      ORDER BY p.id, sp.store_id, sp.price_aud::numeric ASC
    `;

    return NextResponse.json(
      rows.map((r) => ({ ...mapListingRow(r), collectorNumber: r.collector_number })),
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    );
  });
}
