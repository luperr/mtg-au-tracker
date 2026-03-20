import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const cardId = req.nextUrl.searchParams.get("cardId");
  const storeId = req.nextUrl.searchParams.get("storeId");

  if (!cardId || !storeId) {
    return NextResponse.json({ error: "cardId and storeId required" }, { status: 400 });
  }

  const rows = await sql<{
    id: string;
    set_name: string;
    set_code: string;
    collector_number: string;
    rarity: string;
    is_foil: boolean;
    image_uri: string | null;
    price_aud: string;
    shipping_aud: string | null;
    condition: string | null;
    url: string | null;
  }[]>`
    SELECT
      p.id,
      p.set_name,
      p.set_code,
      p.collector_number,
      p.rarity,
      p.is_foil,
      p.image_uri,
      sp.price_aud,
      sp.shipping_aud,
      sp.condition,
      sp.url
    FROM printings p
    JOIN store_prices sp ON sp.printing_id = p.id
    WHERE p.card_id = ${cardId}
      AND sp.store_id = ${storeId}
      AND sp.in_stock = true
      AND sp.price_type = 'sell'
    ORDER BY sp.price_aud::numeric ASC
  `;

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      setName: r.set_name,
      setCode: r.set_code,
      collectorNumber: r.collector_number,
      rarity: r.rarity,
      isFoil: r.is_foil,
      imageUri: r.image_uri,
      priceAud: parseFloat(r.price_aud),
      shippingAud: r.shipping_aud ? parseFloat(r.shipping_aud) : null,
      condition: r.condition,
      url: r.url,
    })),
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
  );
}
