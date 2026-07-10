import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { withApiGuard } from "@/lib/api-helpers";
import { createRateLimiter } from "@/lib/rate-limit";
import { CACHE_REVALIDATE_HOUR, CACHE_STALE_WHILE_REVALIDATE_DAY, RATE_LIMIT_READ_PER_MINUTE } from "@/lib/config";

const checkRateLimit = createRateLimiter(RATE_LIMIT_READ_PER_MINUTE, 60 * 1000);

export async function GET(req: NextRequest) {
  return withApiGuard(req, checkRateLimit, "contact-printings", async (req) => {
    const cardId = req.nextUrl.searchParams.get("cardId")?.trim();
    if (!cardId) return NextResponse.json([], { status: 400 });

    const rows = await sql<{ id: string; set_name: string; collector_number: string; is_foil: boolean }[]>`
      SELECT id, set_name, collector_number, is_foil
      FROM printings
      WHERE card_id = ${cardId}
      ORDER BY released_at DESC, set_name, collector_number
    `;

    const printings = rows.map((r) => ({
      id: r.id,
      label: `${r.set_name} #${r.collector_number}${r.is_foil ? " (Foil)" : ""}`,
    }));

    return NextResponse.json([...printings], {
      headers: { "Cache-Control": `public, s-maxage=${CACHE_REVALIDATE_HOUR}, stale-while-revalidate=${CACHE_STALE_WHILE_REVALIDATE_DAY}` },
    });
  });
}
