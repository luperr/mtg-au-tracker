import postgres from "postgres";

// Connection is cached at module scope — Next.js may hot-reload in dev,
// so we attach to globalThis to avoid exhausting the connection pool.
declare global {
  // eslint-disable-next-line no-var
  var _pgSql: ReturnType<typeof postgres> | undefined;
}

const sql =
  global._pgSql ??
  (global._pgSql = postgres(process.env.DATABASE_URL!, { max: 5 }));

export default sql;

// ─── Types ────────────────────────────────────────────────────────────────────

export type CardSearchResult = {
  id: string;
  name: string;
  type_line: string;
  colors: string[];
  printing_count: number;
  lowest_price: string | null;
  image_uri: string | null;
};

export type CardRow = {
  id: string;
  name: string;
  mana_cost: string | null;
  type_line: string;
  oracle_text: string | null;
  colors: string[];
};

export type PrintingRow = {
  id: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  is_foil: boolean;
  image_uri: string | null;
  scryfall_uri: string;
  usd_price: string | null;
  store_name: string | null;
  price_aud: string | null;
  condition: string | null;
  in_stock: boolean | null;
  store_url: string | null;
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function searchCards(query: string): Promise<CardSearchResult[]> {
  if (!query.trim()) return [];
  return sql<CardSearchResult[]>`
    SELECT
      c.id,
      c.name,
      c.type_line,
      c.colors,
      COUNT(DISTINCT p.id)::int AS printing_count,
      MIN(sp.price_aud) AS lowest_price,
      (
        SELECT p2.image_uri
        FROM printings p2
        WHERE p2.card_id = c.id
          AND p2.image_uri IS NOT NULL
          AND p2.is_foil = false
        LIMIT 1
      ) AS image_uri
    FROM cards c
    LEFT JOIN printings p ON p.card_id = c.id
    LEFT JOIN store_prices sp ON sp.printing_id = p.id AND sp.in_stock = true
    WHERE c.name ILIKE ${"%" + query + "%"}
    GROUP BY c.id, c.name, c.type_line, c.colors
    ORDER BY c.name
    LIMIT 50
  `;
}

export async function getCard(id: string): Promise<CardRow | null> {
  const rows = await sql<CardRow[]>`
    SELECT id, name, mana_cost, type_line, oracle_text, colors
    FROM cards
    WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

export type PrintingWithPrices = {
  id: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  isFoil: boolean;
  imageUri: string | null;
  scryfallUri: string;
  usdPrice: string | null;
  prices: {
    storeName: string;
    priceAud: string;
    condition: string | null;
    inStock: boolean;
    url: string | null;
  }[];
};

export async function getPrintingsWithPrices(
  cardId: string
): Promise<PrintingWithPrices[]> {
  const rows = await sql<PrintingRow[]>`
    SELECT
      p.id,
      p.set_code,
      p.set_name,
      p.collector_number,
      p.rarity,
      p.is_foil,
      p.image_uri,
      p.scryfall_uri,
      p.usd_price,
      s.name AS store_name,
      sp.price_aud,
      sp.condition,
      sp.in_stock,
      sp.url AS store_url
    FROM printings p
    LEFT JOIN store_prices sp ON sp.printing_id = p.id
    LEFT JOIN stores s ON s.id = sp.store_id
    WHERE p.card_id = ${cardId}
    ORDER BY p.set_name, p.is_foil, sp.price_aud
  `;

  const map = new Map<string, PrintingWithPrices>();
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        setCode: row.set_code,
        setName: row.set_name,
        collectorNumber: row.collector_number,
        rarity: row.rarity,
        isFoil: row.is_foil,
        imageUri: row.image_uri,
        scryfallUri: row.scryfall_uri,
        usdPrice: row.usd_price,
        prices: [],
      });
    }
    if (row.store_name && row.price_aud) {
      map.get(row.id)!.prices.push({
        storeName: row.store_name,
        priceAud: row.price_aud,
        condition: row.condition,
        inStock: row.in_stock ?? false,
        url: row.store_url,
      });
    }
  }
  return Array.from(map.values());
}
