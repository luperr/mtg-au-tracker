import { NextResponse } from "next/server";
import sql from "@/lib/db";

export type BulkLookupResult = {
  inputName: string;
  cardId: string | null;
  cardName: string | null;
  imageUri: string | null;
  cheapest: {
    printingId: string;
    setName: string;
    setCode: string;
    rarity: string;
    isFoil: boolean;
    storeName: string;
    priceAud: number;
    condition: string | null;
    url: string | null;
  } | null;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !Array.isArray((body as { names?: unknown }).names)) {
    return NextResponse.json({ error: "Expected { names: string[] }" }, { status: 400 });
  }

  const names = ((body as { names: unknown[] }).names)
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .slice(0, 200); // cap at 200 cards

  if (names.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // For each name, find the best exact (or ILIKE) match + cheapest in-stock price
  const results: BulkLookupResult[] = await Promise.all(
    names.map(async (inputName): Promise<BulkLookupResult> => {
      const trimmed = inputName.trim();

      const rows = await sql<{
        card_id: string;
        card_name: string;
        image_uri: string | null;
        printing_id: string;
        set_name: string;
        set_code: string;
        rarity: string;
        is_foil: boolean;
        store_name: string;
        price_aud: string;
        condition: string | null;
        url: string | null;
      }[]>`
        SELECT
          c.id AS card_id,
          c.name AS card_name,
          (
            SELECT p2.image_uri FROM printings p2
            WHERE p2.card_id = c.id AND p2.image_uri IS NOT NULL AND p2.is_foil = false
            ORDER BY p2.released_at DESC LIMIT 1
          ) AS image_uri,
          p.id AS printing_id,
          p.set_name,
          p.set_code,
          p.rarity,
          p.is_foil,
          s.name AS store_name,
          sp.price_aud,
          sp.condition,
          sp.url
        FROM cards c
        JOIN printings p ON p.card_id = c.id
        JOIN store_prices sp ON sp.printing_id = p.id
          AND sp.in_stock = true
          AND sp.price_type = 'sell'
        JOIN stores s ON s.id = sp.store_id
        WHERE c.name ILIKE ${trimmed}
        ORDER BY sp.price_aud::numeric ASC
        LIMIT 1
      `;

      if (rows.length === 0) {
        return { inputName, cardId: null, cardName: null, imageUri: null, cheapest: null };
      }

      const row = rows[0];
      return {
        inputName,
        cardId: row.card_id,
        cardName: row.card_name,
        imageUri: row.image_uri,
        cheapest: {
          printingId: row.printing_id,
          setName: row.set_name,
          setCode: row.set_code,
          rarity: row.rarity,
          isFoil: row.is_foil,
          storeName: row.store_name,
          priceAud: parseFloat(row.price_aud),
          condition: row.condition,
          url: row.url,
        },
      };
    })
  );

  return NextResponse.json({ results });
}
