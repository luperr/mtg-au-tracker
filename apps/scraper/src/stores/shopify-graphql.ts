/**
 * Shopify Storefront GraphQL source for the generic Shopify scraper.
 *
 * ## Why this exists
 *
 * The REST-style `/collections/{handle}/products.json` endpoint cannot read a
 * large catalogue. Shopify caps pagination of any array at 25,000 objects and
 * enforces it on the *offset* rather than the page number: `limit × page` may
 * not exceed 25,000, so `limit=250&page=101` is HTTP 400 and no page size or
 * amount of parallelism reaches product 25,001. 13 of our Shopify stores are
 * over that line — the largest holds 151,141 products, of which we could see
 * 16%. Before the abort guard landed, the 400 was swallowed into "no more
 * products" and those stores silently published a truncated catalogue.
 *
 * ## Why the top-level products connection, and not the collection
 *
 * `collection(handle:).products` is capped identically — it fails with an
 * explicit "Platform limit for pagination (25000 items) exceeded". Worse, its
 * `filters:[{ available: true }]` argument is applied only *within* that first
 * 25,000 items, so it looks like it works while quietly returning a subset: on
 * The Games District it yields 3,009 products against 18,432 actually in stock.
 *
 * The top-level `products(query:)` connection has no such window — the filter
 * runs against the whole catalogue, so a query narrow enough to return under
 * 25,000 items can be paginated to the end.
 *
 * Every store we scrape exposes this endpoint unauthenticated, so no token or
 * per-store credential is involved.
 *
 * ## Shape compatibility
 *
 * `toShopifyProduct()` converts a GraphQL node into the exact `ShopifyProduct`
 * the REST path produced, so `mapProduct()`, the title parsers and the SKU
 * parser are untouched and keep their test coverage. The only field that can't
 * be had is `inventory_quantity` (needs the `unauthenticated_read_product_
 * inventory` scope) — it is set to 0, which is safe because `isInStock()` only
 * consults it when `available` is not a boolean, and here it always is.
 */

import type { ShopifyProduct, ShopifyVariant, ShopifyOption } from "./shopify-types.js";

/** Storefront API version. Pinned — Shopify removes versions after ~12 months. */
export const STOREFRONT_API_VERSION = "2025-01";

/**
 * Products per request. 250 is Shopify's hard maximum for any connection.
 *
 * At 20 variants each this bills ~277 of the 1,000-point query cost budget, so
 * there is no headroom problem, and a 18k-product store is ~75 requests.
 */
export const GRAPHQL_PAGE_SIZE = 250;

/**
 * Variants requested per product.
 *
 * Condition-variant stores list at most ~10 (5 conditions × foil/non-foil).
 * Location-variant stores (GUF) use one variant per branch, so this needs slack
 * above the branch count. Products exceeding it are reported by
 * `GraphQLProductsPage.truncatedVariantProducts` rather than clipped silently.
 */
export const GRAPHQL_VARIANT_LIMIT = 50;

/** Shopify's documented ceiling on paginating any single array. */
export const PAGINATION_LIMIT = 25000;

export const PRODUCTS_QUERY = `
  query StoreProducts($query: String!, $cursor: String, $pageSize: Int!, $variantLimit: Int!) {
    products(first: $pageSize, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: false) {
      edges {
        cursor
        node {
          id
          title
          handle
          productType
          createdAt
          tags
          options { name values }
          variants(first: $variantLimit) {
            edges {
              node {
                id
                title
                sku
                availableForSale
                price { amount }
                selectedOptions { name value }
              }
            }
            pageInfo { hasNextPage }
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

/**
 * Walk the store's singles collection directly.
 *
 * Preferred whenever it fits, because the collection names exactly the products
 * we want. The top-level query can only approximate that with `product_type`,
 * and for stores whose type is a generic "Single Cards" or "Trading Cards" that
 * approximation drags in Pokémon and other TCGs — measured on Gameology as a
 * fall in match rate from ~100% to 45.7%.
 *
 * Deliberately no `filters:` argument. `filters:[{ available: true }]` is applied
 * only within the first 25,000 items of the collection, so on a large store it
 * returns a subset while looking like it succeeded (3,009 of 18,432 on The Games
 * District). Without it, an over-large collection instead fails loudly with the
 * platform-limit error, which is the signal to switch to the top-level query.
 */
export const COLLECTION_QUERY = `
  query CollectionProducts($handle: String!, $cursor: String, $pageSize: Int!, $variantLimit: Int!) {
    collection(handle: $handle) {
      products(first: $pageSize, after: $cursor) {
        edges {
          cursor
          node {
            id
            title
            handle
            productType
            tags
            options { name values }
            variants(first: $variantLimit) {
              edges {
                node {
                  id
                  title
                  sku
                  availableForSale
                  price { amount }
                  selectedOptions { name value }
                }
              }
              pageInfo { hasNextPage }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }
  }
`;

/**
 * Sample a store's MTG singles collection to learn its `productType` vocabulary.
 *
 * The top-level products connection has no notion of collections, so the
 * collection handle we already hold per store is used once, up front, purely to
 * discover the product type to filter on. Only the first page is needed — the
 * type is uniform within a singles collection.
 */
export const PRODUCT_TYPE_QUERY = `
  query CollectionProductTypes($handle: String!, $pageSize: Int!) {
    collection(handle: $handle) {
      products(first: $pageSize) {
        edges { node { productType } }
      }
    }
  }
`;

// ── Response shapes ───────────────────────────────────────────────────────────

interface GqlSelectedOption {
  name: string;
  value: string;
}

interface GqlVariantNode {
  id: string;
  title: string;
  sku: string | null;
  availableForSale: boolean;
  price: { amount: string } | null;
  selectedOptions: GqlSelectedOption[];
}

interface GqlProductNode {
  id: string;
  title: string;
  handle: string;
  productType: string | null;
  /** Only requested by PRODUCTS_QUERY — the collection walk never needs it. */
  createdAt?: string;
  tags: string[];
  options: Array<{ name: string; values: string[] }>;
  variants: {
    edges: Array<{ node: GqlVariantNode }>;
    pageInfo: { hasNextPage: boolean };
  };
}

export interface GraphQLProductsPage {
  products: ShopifyProduct[];
  cursor: string | null;
  hasNextPage: boolean;
  /** Products whose variant list was clipped by GRAPHQL_VARIANT_LIMIT. */
  truncatedVariantProducts: number;
  /**
   * `createdAt` of the last product on this page, as epoch ms.
   *
   * PRODUCTS_QUERY sorts by creation time, so this is the high-water mark a
   * following window resumes from once the pagination limit is hit. Null on the
   * collection walk, which is not sorted and never needs to resume.
   */
  lastCreatedAt: number | null;
}

interface GqlError {
  message: string;
  extensions?: { code?: string };
}

export interface StorefrontResponse {
  data?: {
    products?: {
      edges: Array<{ cursor: string; node: GqlProductNode }>;
      pageInfo: { hasNextPage: boolean };
    };
  };
  errors?: GqlError[];
}

export interface CollectionResponse {
  data?: {
    collection: {
      products: {
        edges: Array<{ cursor: string; node: GqlProductNode }>;
        pageInfo: { hasNextPage: boolean };
      };
    } | null;
  };
  errors?: GqlError[];
}

export interface ProductTypeResponse {
  data?: {
    collection: { products: { edges: Array<{ node: { productType: string | null } }> } } | null;
  };
  errors?: GqlError[];
}

// ── Errors ────────────────────────────────────────────────────────────────────

/**
 * The query matched more than 25,000 products, so it cannot be paginated to the
 * end. Recoverable by narrowing the query — see splitPriceRange().
 */
export class PaginationLimitError extends Error {
  constructor(readonly query: string) {
    super(`Storefront query exceeded the ${PAGINATION_LIMIT}-item pagination limit: ${query}`);
  }
}

function isPaginationLimitMessage(message: string): boolean {
  return /platform limit for pagination/i.test(message);
}

// ── Query building ────────────────────────────────────────────────────────────

/**
 * `created_at` is the partition key because it is one of the few product fields
 * the Storefront search actually honours. `price:`, `vendor:`, `sku:` and
 * `updated_at:` are all accepted and then silently ignored — a query carrying
 * them returns the unfiltered catalogue, which as a partitioning scheme would
 * mean every window returning everything. Verified against a live store:
 * splitting on created_at reproduced the whole catalogue with zero gaps and
 * zero overlaps, where `price:>=1000000` still returned every product.
 */

/**
 * Quote a value for Shopify search syntax. Backslashes must be escaped before
 * quotes, or a value ending in one escapes its own closing quote.
 */
function quote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * Build the search query for a store's in-stock singles, optionally narrowed to
 * a price window.
 *
 * `available_for_sale:true` is both the cap workaround and the right filter on
 * the merits — an out-of-stock listing has no price worth storing, the same
 * reasoning crystalcommerce.ts already applies.
 */
export function buildProductQuery(productType: string, since?: number | null): string {
  const terms = [`available_for_sale:true`, `product_type:${quote(productType)}`];
  if (since != null) terms.push(`created_at:>=${new Date(since).toISOString()}`);
  return terms.join(" AND ");
}

// ── Conversion ────────────────────────────────────────────────────────────────

/**
 * Numeric id from a Storefront global id ("gid://shopify/Product/12345").
 *
 * Only used for de-duplication and logging; a node whose id doesn't parse
 * yields 0 rather than failing the page.
 */
function numericId(gid: string): number {
  const tail = gid.split("/").pop() ?? "";
  const n = Number.parseInt(tail, 10);
  return Number.isNaN(n) ? 0 : n;
}

function toShopifyVariant(node: GqlVariantNode): ShopifyVariant {
  // The REST payload exposed option values positionally as option1..3, and
  // parseVariant() pairs them with product.options by index. selectedOptions
  // arrives in that same axis order, so index is preserved here.
  const slots = node.selectedOptions.map((o) => o.value);

  return {
    id: numericId(node.id),
    title: node.title,
    // REST returned price as a decimal string ("4.50"); GraphQL returns a Money
    // scalar that drops trailing zeros ("4.5"). parseFloat() is applied
    // downstream either way, but normalise so logs and any string comparison
    // see what the REST path produced.
    price: node.price ? Number.parseFloat(node.price.amount).toFixed(2) : "0.00",
    sku: node.sku,
    available: node.availableForSale,
    // Unavailable without an inventory access scope. isInStock() prefers
    // `available`, which is always a boolean here, so this is never consulted.
    inventory_quantity: 0,
    option1: slots[0] ?? null,
    option2: slots[1] ?? null,
    option3: slots[2] ?? null,
  };
}

export function toShopifyProduct(node: GqlProductNode): ShopifyProduct {
  const options: ShopifyOption[] = node.options.map((o) => ({ name: o.name, values: o.values }));

  return {
    id: numericId(node.id),
    title: node.title,
    handle: node.handle,
    product_type: node.productType ?? "",
    tags: node.tags,
    options,
    variants: node.variants.edges.map((e) => toShopifyVariant(e.node)),
  };
}

function throwOnErrors(errors: GqlError[] | undefined, query: string): void {
  if (!errors?.length) return;
  if (errors.some((e) => isPaginationLimitMessage(e.message))) {
    throw new PaginationLimitError(query);
  }
  throw new Error(`Storefront API error: ${errors.map((e) => e.message).join("; ")}`);
}

/**
 * Convert one Storefront response page into REST-shaped products.
 *
 * Throws on GraphQL-level errors: they arrive with HTTP 200, so left unchecked
 * they would read as an empty page and end pagination early — the exact silent
 * truncation this module exists to remove.
 */
export function parseProductsPage(body: StorefrontResponse, query: string): GraphQLProductsPage {
  throwOnErrors(body.errors, query);

  const connection = body.data?.products;
  if (!connection) {
    throw new Error("Storefront API returned no products connection");
  }

  const edges = connection.edges;
  let truncatedVariantProducts = 0;
  const products = edges.map((e) => {
    if (e.node.variants.pageInfo.hasNextPage) truncatedVariantProducts++;
    return toShopifyProduct(e.node);
  });

  const lastNode = edges.length > 0 ? edges[edges.length - 1].node : null;
  const lastCreatedAt = lastNode?.createdAt ? Date.parse(lastNode.createdAt) : null;

  return {
    products,
    cursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
    hasNextPage: connection.pageInfo.hasNextPage,
    truncatedVariantProducts,
    lastCreatedAt: Number.isNaN(lastCreatedAt) ? null : lastCreatedAt,
  };
}

/**
 * Convert one page of the collection walk.
 *
 * Same contract as parseProductsPage(), including raising PaginationLimitError
 * — for this query that error is the signal that the collection is too large to
 * read directly and the top-level query must be used instead.
 */
export function parseCollectionPage(body: CollectionResponse, handle: string): GraphQLProductsPage {
  throwOnErrors(body.errors, handle);

  const collection = body.data?.collection;
  if (!collection) {
    throw new Error(`Collection "${handle}" not found — check collectionHandle`);
  }

  const edges = collection.products.edges;
  let truncatedVariantProducts = 0;
  const products = edges.map((e) => {
    if (e.node.variants.pageInfo.hasNextPage) truncatedVariantProducts++;
    return toShopifyProduct(e.node);
  });

  return {
    products,
    cursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
    hasNextPage: collection.products.pageInfo.hasNextPage,
    truncatedVariantProducts,
    lastCreatedAt: null,
  };
}

/**
 * Most common productType in the store's singles collection.
 *
 * Uses the mode rather than the first row so a stray mis-typed product doesn't
 * decide the filter for the whole store.
 */
export function dominantProductType(body: ProductTypeResponse, handle: string): string {
  throwOnErrors(body.errors, handle);

  const collection = body.data?.collection;
  if (!collection) {
    throw new Error(`Collection "${handle}" not found — check collectionHandle`);
  }

  const counts = new Map<string, number>();
  for (const edge of collection.products.edges) {
    const type = edge.node.productType;
    if (!type) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }

  if (best === null) {
    throw new Error(`Collection "${handle}" has no products with a product type`);
  }
  return best;
}

export function storefrontUrl(baseUrl: string): string {
  return `${baseUrl}/api/${STOREFRONT_API_VERSION}/graphql.json`;
}
