import { sql } from "../db/client.js";
import { MAX_SEARCH_OFFSET, SEARCH_MIN_QUERY_LENGTH, SEARCH_FUZZY_MIN_SIMILARITY } from "../config.js";
import { DEFAULT_TREATMENT, FACET_KEYS, priceFilterApplies, type FacetKey, type SearchState, type SearchView } from "./params.js";
import { SEARCH_V2_PAGE_SIZE, type Facets, type SearchTile, type SearchV2Result } from "./types.js";

/**
 * v2 search — listing-grained, with filters, facets and three view modes.
 *
 * Unlike searchCards(), this reads store_prices live, which the denormalised card
 * columns exist to avoid (see CLAUDE.md: ~40 IOPS, store_prices cold every
 * morning). What keeps it bounded is the name query: it is mandatory, and it is
 * resolved against the trigram index on cards.name and capped *before* any join, so
 * the store_prices rows read are only those of at most SEARCH_V2_CARD_CAP cards,
 * reached through printings_card_id_idx → store_prices_printing_store_idx.
 * Filter-only browsing (no q) would scan the whole of store_prices and is
 * deliberately not supported until it has been measured.
 *
 * One statement returns tiles and facets together so that listing set is read once:
 * `listings` is MATERIALIZED and every later CTE — the filtered tiles and each facet
 * group — reads it from memory.
 */

/**
 * Most cards whose listings we consider. Lower than SEARCH_CANDIDATE_CAP because
 * each card here fans out to all its printings' listings, not one row. Ranked like
 * searchCards() so the cap keeps the best name matches.
 */
export const SEARCH_V2_CARD_CAP = 500;

/**
 * listings column each facet filters and groups on, the column that labels it, and a
 * value never offered as an option (the default treatment — see DEFAULT_TREATMENT).
 */
const FACET_COLUMNS: Record<FacetKey, { value: string; label: string; omit?: string }> = {
  store: { value: "store_id", label: "store_name" },
  set: { value: "set_code", label: "set_name" },
  condition: { value: "condition_key", label: "condition_key" },
  finish: { value: "finish", label: "finish" },
  treatment: { value: "treatment", label: "treatment", omit: DEFAULT_TREATMENT },
};

/** What one tile is, per view. */
const GROUP_KEY: Record<SearchView, string> = {
  card: "card_id",
  printing: "printing_id",
  listings: "listing_id",
};

function emptyFacets(): Facets {
  return Object.fromEntries(FACET_KEYS.map((k) => [k, []])) as unknown as Facets;
}

/**
 * Escape LIKE metacharacters so a query is matched literally. Unescaped, `_` matches
 * any character and `%%%` matches every card — the cap bounds it, but it still costs
 * the full 500-card read for a nonsense query.
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

/**
 * The price range, whatever the view. Every facet count respects it — it isn't a
 * facet, so there is no "all filters except its own" for it.
 */
function priceRange({ price: { min, max } }: SearchState) {
  return sql`${min === null ? sql`TRUE` : sql`price >= ${min}`} AND ${max === null ? sql`TRUE` : sql`price <= ${max}`}`;
}

/** AND of every facet filter, optionally leaving one facet's own filter out. Price is separate. */
function facetPredicate(state: SearchState, except?: FacetKey) {
  return FACET_KEYS.filter((k) => k !== except && state.filters[k].length > 0).reduce(
    (acc, k) => sql`${acc} AND ${sql(FACET_COLUMNS[k].value)} = ANY(${state.filters[k]})`,
    sql`TRUE`,
  );
}

/** Every active filter, price included — what a tile has to pass. */
function filterPredicate(state: SearchState, except?: FacetKey) {
  return sql`${facetPredicate(state, except)} AND ${priceFilterApplies(state) ? priceRange(state) : sql`TRUE`}`;
}

/**
 * Tile order. Every variant ends on the group key so ties can't reorder between
 * page requests; before that, price → store → condition as the spec'd tiebreaks.
 */
function orderBy(state: SearchState) {
  const tail = sql`store_id, condition_rank, group_key`;
  switch (state.sort) {
    case "price_desc": return sql`price DESC, ${tail}`;
    case "name":       return sql`name, price, ${tail}`;
    case "set":        return sql`released_at DESC, set_code, collector_number, price, ${tail}`;
    default:           return sql`price, ${tail}`;
  }
}

export async function searchListings(state: SearchState): Promise<SearchV2Result> {
  const empty: SearchV2Result = {
    tiles: [], counts: { card: 0, printing: 0, listings: 0 },
    capped: false, fuzzy: false, topCardId: null, facets: emptyFacets(),
  };
  if (state.q.length < SEARCH_MIN_QUERY_LENGTH) return empty;

  const offset = Math.min((state.page - 1) * SEARCH_V2_PAGE_SIZE, MAX_SEARCH_OFFSET);
  const groupKey = sql(GROUP_KEY[state.view]);
  const q = state.q;

  // Same ranking as searchCards(), so the cap keeps the best name matches.
  const nameRank = sql`
    CASE
      WHEN lower(c.name) = lower(${q})                          THEN 0
      WHEN lower(c.name) LIKE lower(${escapeLike(q)}) || '%'    THEN 1
      WHEN strpos(' ' || lower(c.name), ' ' || lower(${q})) > 0 THEN 2
      ELSE 3
    END,
    word_similarity(${q}, c.name) DESC, length(c.name), c.name, c.id`;

  // count(*) in listings view: each listing is its own tile, so DISTINCT is wasted work.
  const tileCount = state.view === "listings" ? sql`count(*)` : sql`count(DISTINCT ${groupKey})`;

  const facetQueries = FACET_KEYS.map((k) => sql`
    SELECT ${k}::text AS facet, ${sql(FACET_COLUMNS[k].value)}::text AS value,
           max(${sql(FACET_COLUMNS[k].label)})::text AS label, ${tileCount}::int AS count
    FROM listings
    WHERE ${filterPredicate(state, k)}
      ${FACET_COLUMNS[k].omit ? sql`AND ${sql(FACET_COLUMNS[k].value)} <> ${FACET_COLUMNS[k].omit}` : sql``}
    GROUP BY 2
  `);
  const facetUnion = facetQueries.slice(1).reduce((acc, f) => sql`${acc} UNION ALL ${f}`, facetQueries[0]);

  // "+N more stores from $X" only means something when a tile groups several listings.
  const others = state.view === "listings"
    ? sql`NULL::int AS other_stores, NULL::numeric AS other_min`
    : sql`
        (SELECT count(DISTINCT f.store_id) FROM filtered f
          WHERE f.${groupKey} = pg.group_key AND f.store_id <> pg.store_id)::int AS other_stores,
        (SELECT min(f.price) FROM filtered f
          WHERE f.${groupKey} = pg.group_key AND f.store_id <> pg.store_id) AS other_min`;

  const [row] = await sql<{
    tiles: SearchTile[] | null;
    facets: { facet: FacetKey; value: string; label: string; count: number }[] | null;
    counts: SearchV2Result["counts"];
    cand_count: number;
    fuzzy: boolean;
    top_card_id: string | null;
  }[]>`
    -- Two candidate passes, as in searchCards(): a literal substring match, and a
    -- trigram fuzzy match that only runs when the literal pass found no card at all.
    -- The NOT EXISTS is uncorrelated, so Postgres evaluates it once as a one-time
    -- filter and skips the fuzzy scan entirely whenever lit has rows. Deciding on
    -- *cards* rather than on this page's tiles keeps every page and every filter
    -- combination of one query in the same mode.
    WITH lit AS MATERIALIZED (
      SELECT c.id, c.slug, c.name, row_number() OVER (ORDER BY ${nameRank}) AS rnk
      FROM cards c
      WHERE c.name ILIKE ${"%" + escapeLike(q) + "%"}
      ORDER BY ${nameRank}
      LIMIT ${SEARCH_V2_CARD_CAP + 1}
    ),
    fz AS MATERIALIZED (
      SELECT c.id, c.slug, c.name, row_number() OVER (ORDER BY ${nameRank}) AS rnk
      FROM cards c
      WHERE NOT EXISTS (SELECT 1 FROM lit)
        AND ${q} <% c.name AND word_similarity(${q}, c.name) >= ${SEARCH_FUZZY_MIN_SIMILARITY}
      ORDER BY ${nameRank}
      LIMIT ${SEARCH_V2_CARD_CAP + 1}
    ),
    cand AS (
      SELECT * FROM lit UNION ALL SELECT * FROM fz
    ),
    listings AS MATERIALIZED (
      SELECT
        sp.id::text AS listing_id,
        c.id AS card_id, c.slug, c.name,
        p.id AS printing_id, p.set_code, p.set_name, p.collector_number, p.rarity,
        p.is_foil, p.finish, p.treatment, p.border_color, p.frame_effects, p.image_uri, p.released_at,
        sp.price_aud::numeric AS price, sp.shipping_aud, sp.condition, sp.url,
        sp.store_id, s.name AS store_name,
        -- Unnormalised and missing conditions share one bucket, so the facet has a
        -- value to filter on instead of NULL (which = ANY can never match).
        CASE WHEN sp.condition IN ('NM','LP','MP','HP','DMG') THEN sp.condition ELSE 'unknown' END AS condition_key,
        CASE sp.condition WHEN 'NM' THEN 0 WHEN 'LP' THEN 1 WHEN 'MP' THEN 2 WHEN 'HP' THEN 3 WHEN 'DMG' THEN 4 ELSE 5 END AS condition_rank
      FROM cand c
      JOIN printings p ON p.card_id = c.id
      -- In stock only: an out-of-stock listing is a price nobody can pay. A stock
      -- filter can come back once stores expose quantities rather than a flag.
      JOIN store_prices sp ON sp.printing_id = p.id AND sp.price_type = 'sell' AND sp.in_stock
      JOIN stores s ON s.id = sp.store_id
      WHERE c.rnk <= ${SEARCH_V2_CARD_CAP}
    ),
    filtered AS (
      SELECT *, ${groupKey} AS group_key FROM listings WHERE ${filterPredicate(state)}
    ),
    winners AS (
      SELECT DISTINCT ON (group_key) *
      FROM filtered
      ORDER BY group_key, price, store_id, condition_rank, listing_id
    ),
    pg AS (
      SELECT *, row_number() OVER (ORDER BY ${orderBy(state)}) AS ord
      FROM winners
      ORDER BY ord
      LIMIT ${SEARCH_V2_PAGE_SIZE} OFFSET ${offset}
    ),
    tiles AS (
      SELECT pg.*, ${others} FROM pg
    )
    SELECT
      (SELECT json_agg(json_build_object(
          'key', group_key, 'card_id', card_id, 'slug', slug, 'name', name,
          'printing_id', printing_id, 'set_code', set_code, 'set_name', set_name,
          'collector_number', collector_number, 'rarity', rarity, 'is_foil', is_foil,
          'finish', finish, 'treatment', treatment, 'border_color', border_color,
          'frame_effects', frame_effects, 'image_uri', image_uri, 'price', price,
          'shipping_aud', shipping_aud, 'condition', condition,
          'url', url, 'store_id', store_id, 'store_name', store_name,
          'other_stores', other_stores, 'other_min', other_min
        ) ORDER BY ord) FROM tiles) AS tiles,
      (SELECT json_agg(f ORDER BY f.facet, f.count DESC, f.label) FROM (${facetUnion}) f) AS facets,
      -- Tile counts for every view, so the view tabs can show what each would give.
      -- One pass: price only applies outside card view, so it's a FILTER on the others.
      (SELECT json_build_object(
          'card', count(DISTINCT card_id),
          'printing', count(DISTINCT printing_id) FILTER (WHERE ${priceRange(state)}),
          'listings', count(*) FILTER (WHERE ${priceRange(state)})
        ) FROM listings WHERE ${facetPredicate(state)}) AS counts,
      (SELECT count(*)::int FROM cand) AS cand_count,
      EXISTS (SELECT 1 FROM fz) AS fuzzy,
      (SELECT id FROM cand ORDER BY rnk LIMIT 1) AS top_card_id
  `;

  const facets = emptyFacets();
  for (const f of row?.facets ?? []) facets[f.facet].push({ value: f.value, label: f.label, count: f.count });

  return {
    // json numerics arrive as JS numbers already; Number() covers a driver that sends strings.
    tiles: (row?.tiles ?? []).map((t) => ({
      ...t,
      price: Number(t.price),
      other_min: t.other_min === null ? null : Number(t.other_min),
    })),
    counts: row?.counts ?? empty.counts,
    capped: (row?.cand_count ?? 0) > SEARCH_V2_CARD_CAP,
    fuzzy: row?.fuzzy ?? false,
    topCardId: row?.top_card_id ?? null,
    facets,
  };
}
