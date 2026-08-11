import { describe, it, expect } from "vitest";
import {
  parseCollectionPage,
  parseProductsPage,
  toShopifyProduct,
  storefrontUrl,
  buildProductQuery,
  dominantProductType,
  PaginationLimitError,
  STOREFRONT_API_VERSION,
  type CollectionResponse,
  type ProductTypeResponse,
  type StorefrontResponse,
} from "./shopify-graphql.js";
import { mapProduct } from "./shopify.js";
import type { ShopifyStoreConfig } from "./stores.config.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function variantNode(over: Partial<{
  id: string; title: string; sku: string | null; availableForSale: boolean;
  price: { amount: string } | null; selectedOptions: Array<{ name: string; value: string }>;
}> = {}) {
  return {
    id: "gid://shopify/ProductVariant/555",
    title: "Near Mint",
    sku: "BLC-127-EN-NF-1",
    availableForSale: true,
    price: { amount: "1.5" },
    selectedOptions: [{ name: "Condition", value: "Near Mint" }],
    ...over,
  };
}

function productNode(over: Record<string, unknown> = {}) {
  return {
    id: "gid://shopify/Product/12345",
    title: "Arcane Signet [Bloomburrow Commander]",
    handle: "arcane-signet-bloomburrow-commander",
    productType: "MTG Single",
    tags: ["Artifact", "Bloomburrow Commander"],
    options: [{ name: "Condition", values: ["Near Mint", "Lightly Played"] }],
    variants: { edges: [{ node: variantNode() }], pageInfo: { hasNextPage: false } },
    ...over,
  };
}

function response(nodes: ReturnType<typeof productNode>[], hasNextPage = false): StorefrontResponse {
  return {
    data: {
      products: {
        edges: nodes.map((node, i) => ({ cursor: `cursor-${i}`, node })),
        pageInfo: { hasNextPage },
      },
    },
  } as StorefrontResponse;
}

const Q = "available_for_sale:true AND product_type:'MTG Single'";

// ─── toShopifyProduct ─────────────────────────────────────────────────────────

describe("toShopifyProduct", () => {
  it("parses the numeric id out of the global id", () => {
    expect(toShopifyProduct(productNode()).id).toBe(12345);
  });

  it("falls back to 0 for an unparseable global id", () => {
    expect(toShopifyProduct(productNode({ id: "gid://shopify/Product/abc" })).id).toBe(0);
  });

  it("maps productType onto product_type", () => {
    expect(toShopifyProduct(productNode()).product_type).toBe("MTG Single");
  });

  it("defaults a null productType to empty string so isTokenOrEmblem can lowercase it", () => {
    expect(toShopifyProduct(productNode({ productType: null })).product_type).toBe("");
  });

  it("normalises the Money scalar back to a 2dp decimal string", () => {
    const p = toShopifyProduct(productNode());
    expect(p.variants[0].price).toBe("1.50");
  });

  it("treats a missing price as 0.00 so mapProduct skips the variant", () => {
    const node = productNode({
      variants: { edges: [{ node: variantNode({ price: null }) }], pageInfo: { hasNextPage: false } },
    });
    expect(toShopifyProduct(node).variants[0].price).toBe("0.00");
  });

  it("maps availableForSale onto available", () => {
    const node = productNode({
      variants: {
        edges: [{ node: variantNode({ availableForSale: false }) }],
        pageInfo: { hasNextPage: false },
      },
    });
    expect(toShopifyProduct(node).variants[0].available).toBe(false);
  });

  it("spreads selectedOptions positionally onto option1..3", () => {
    const node = productNode({
      variants: {
        edges: [{
          node: variantNode({
            selectedOptions: [
              { name: "Condition", value: "Near Mint" },
              { name: "Finish", value: "Foil" },
              { name: "Language", value: "EN" },
            ],
          }),
        }],
        pageInfo: { hasNextPage: false },
      },
    });
    const v = toShopifyProduct(node).variants[0];
    expect([v.option1, v.option2, v.option3]).toEqual(["Near Mint", "Foil", "EN"]);
  });

  it("leaves unused option slots null", () => {
    const v = toShopifyProduct(productNode()).variants[0];
    expect([v.option1, v.option2, v.option3]).toEqual(["Near Mint", null, null]);
  });

  it("preserves the SKU that drives collector-number matching", () => {
    expect(toShopifyProduct(productNode()).variants[0].sku).toBe("BLC-127-EN-NF-1");
  });

  it("sets inventory_quantity to 0 — the scope for it is not granted", () => {
    expect(toShopifyProduct(productNode()).variants[0].inventory_quantity).toBe(0);
  });
});

// ─── parseProductsPage ────────────────────────────────────────────────────────

describe("parseProductsPage", () => {
  it("returns the last edge's cursor so the next page resumes from it", () => {
    const page = parseProductsPage(response([productNode(), productNode(), productNode()]), Q);
    expect(page.cursor).toBe("cursor-2");
  });

  it("reports a null cursor for an empty page rather than inventing one", () => {
    expect(parseProductsPage(response([]), Q).cursor).toBeNull();
  });

  it("passes hasNextPage through", () => {
    expect(parseProductsPage(response([productNode()], true), Q).hasNextPage).toBe(true);
  });

  // GraphQL errors arrive with HTTP 200. Swallowed, they read as an empty page
  // and end pagination early — the silent truncation this module removes.
  it("throws on a GraphQL-level error instead of reporting an empty page", () => {
    const body: StorefrontResponse = { errors: [{ message: "Throttled" }] };
    expect(() => parseProductsPage(body, Q)).toThrow(/Throttled/);
  });

  it("raises PaginationLimitError for the platform limit so the caller can split", () => {
    const body: StorefrontResponse = {
      errors: [{ message: "Platform limit for pagination (25000 items) exceeded by 250 items." }],
    };
    expect(() => parseProductsPage(body, Q)).toThrow(PaginationLimitError);
  });

  it("throws when the products connection is missing entirely", () => {
    const body = { data: {} } as StorefrontResponse;
    expect(() => parseProductsPage(body, Q)).toThrow(/no products connection/);
  });

  it("counts products whose variant list was clipped", () => {
    const clipped = productNode({
      variants: { edges: [{ node: variantNode() }], pageInfo: { hasNextPage: true } },
    });
    const page = parseProductsPage(response([productNode(), clipped, clipped]), Q);
    expect(page.truncatedVariantProducts).toBe(2);
  });

  it("reports zero truncation when every variant list fits", () => {
    expect(parseProductsPage(response([productNode()]), Q).truncatedVariantProducts).toBe(0);
  });
});

// ─── parseCollectionPage ──────────────────────────────────────────────────────
// The preferred source: the collection names exactly the products we want,
// where product_type can only approximate it.

describe("parseCollectionPage", () => {
  function collectionResponse(
    nodes: ReturnType<typeof productNode>[],
    hasNextPage = false,
  ): CollectionResponse {
    return {
      data: {
        collection: {
          products: {
            edges: nodes.map((node, i) => ({ cursor: `c-${i}`, node })),
            pageInfo: { hasNextPage },
          },
        },
      },
    } as CollectionResponse;
  }

  it("converts collection edges to REST-shaped products", () => {
    const page = parseCollectionPage(collectionResponse([productNode()]), "mtg-singles");
    expect(page.products[0].title).toBe("Arcane Signet [Bloomburrow Commander]");
  });

  it("returns the last cursor for the next page", () => {
    const page = parseCollectionPage(collectionResponse([productNode(), productNode()]), "h");
    expect(page.cursor).toBe("c-1");
  });

  it("throws when the handle does not resolve", () => {
    const body = { data: { collection: null } } as CollectionResponse;
    expect(() => parseCollectionPage(body, "bad")).toThrow(/not found/);
  });

  // This error is the signal to fall back to the top-level query, so it must
  // stay distinguishable from any other failure.
  it("raises PaginationLimitError when the collection is too large to walk", () => {
    const body: CollectionResponse = {
      errors: [{ message: "Platform limit for pagination (25000 items) exceeded by 250 items." }],
    };
    expect(() => parseCollectionPage(body, "h")).toThrow(PaginationLimitError);
  });

  it("keeps out-of-stock products, unlike the in-stock-filtered query", () => {
    const node = productNode({
      variants: {
        edges: [{ node: variantNode({ availableForSale: false }) }],
        pageInfo: { hasNextPage: false },
      },
    });
    const page = parseCollectionPage(collectionResponse([node]), "h");
    expect(page.products[0].variants[0].available).toBe(false);
  });
});

// ─── buildProductQuery ────────────────────────────────────────────────────────

describe("buildProductQuery", () => {
  it("filters to in-stock products of the store's type", () => {
    expect(buildProductQuery("MTG Single")).toBe(
      "available_for_sale:true AND product_type:'MTG Single'",
    );
  });

  it("adds a created_at floor when resuming past the pagination limit", () => {
    const q = buildProductQuery("MTG Single", Date.UTC(2024, 0, 1));
    expect(q).toBe(
      "available_for_sale:true AND product_type:'MTG Single' AND created_at:>=2024-01-01T00:00:00.000Z",
    );
  });

  it("omits the floor when there is nothing to resume from", () => {
    expect(buildProductQuery("MTG Single", null)).toBe(
      "available_for_sale:true AND product_type:'MTG Single'",
    );
  });

  // An unescaped quote would end the literal early and silently widen the match.
  it("escapes a single quote in the product type", () => {
    expect(buildProductQuery("Collector's Single")).toContain("product_type:'Collector\\'s Single'");
  });

  it("escapes backslashes", () => {
    expect(buildProductQuery("MTG\\Single")).toContain("product_type:'MTG\\\\Single'");
  });

  // Without this, the trailing backslash escapes the closing quote.
  it("escapes a trailing backslash so the literal still terminates", () => {
    expect(buildProductQuery("MTG Single\\")).toContain("product_type:'MTG Single\\\\'");
  });

  it("escapes both characters of an embedded \\'", () => {
    expect(buildProductQuery("a\\'b")).toContain("product_type:'a\\\\\\'b'");
  });
});

// ─── Creation-date watermark ──────────────────────────────────────────────────
// PRODUCTS_QUERY sorts by created_at so an overflowing walk can resume from the
// last product it reached, rather than probing blindly for a split point.

describe("lastCreatedAt", () => {
  it("reports the last product's creation date on the page", () => {
    const page = parseProductsPage(
      response([
        productNode({ createdAt: "2024-01-01T00:00:00Z" }),
        productNode({ createdAt: "2024-06-02T03:04:05Z" }),
      ]),
      Q,
    );
    expect(page.lastCreatedAt).toBe(Date.parse("2024-06-02T03:04:05Z"));
  });

  it("is null on an empty page, so a walk cannot resume from nowhere", () => {
    expect(parseProductsPage(response([]), Q).lastCreatedAt).toBeNull();
  });

  it("is null for the collection walk, which is unsorted", () => {
    const body = {
      data: {
        collection: {
          products: { edges: [{ cursor: "c", node: productNode() }], pageInfo: { hasNextPage: false } },
        },
      },
    } as CollectionResponse;
    expect(parseCollectionPage(body, "h").lastCreatedAt).toBeNull();
  });
});

// ─── dominantProductType ──────────────────────────────────────────────────────

describe("dominantProductType", () => {
  function typeResponse(types: Array<string | null>): ProductTypeResponse {
    return {
      data: {
        collection: { products: { edges: types.map((productType) => ({ node: { productType } })) } },
      },
    };
  }

  it("picks the most common type", () => {
    expect(dominantProductType(typeResponse(["MTG Single", "MTG Single", "Sealed"]), "h"))
      .toBe("MTG Single");
  });

  // Stores differ: "Single Cards", "TCG Singles", "Trading Cards" all occur.
  it("returns whatever the store actually uses, not a hardcoded value", () => {
    expect(dominantProductType(typeResponse(["TCG Singles", "TCG Singles"]), "h"))
      .toBe("TCG Singles");
  });

  it("ignores products with no type", () => {
    expect(dominantProductType(typeResponse([null, null, "MTG Single"]), "h")).toBe("MTG Single");
  });

  it("throws when the collection handle does not resolve", () => {
    const body = { data: { collection: null } } as ProductTypeResponse;
    expect(() => dominantProductType(body, "bad-handle")).toThrow(/not found/);
  });

  it("throws when no product carries a type, rather than filtering on empty", () => {
    expect(() => dominantProductType(typeResponse([null]), "h")).toThrow(/no products with a product type/);
  });
});

// ─── End-to-end shape compatibility ───────────────────────────────────────────
// The whole design rests on GraphQL products being indistinguishable from REST
// ones to mapProduct(). If that stops holding, every title parser breaks.

describe("GraphQL products feed mapProduct unchanged", () => {
  const config: ShopifyStoreConfig = {
    id: "the_games_district",
    baseUrl: "https://thegamesdistrict.com",
    collectionHandle: "mtg-singles",
  };

  it("produces a ScrapedCard from a converted GraphQL product", () => {
    const [card] = mapProduct(toShopifyProduct(productNode()), config);
    expect(card).toMatchObject({
      rawName: "Arcane Signet",
      setName: "Bloomburrow Commander",
      price: "1.50",
      condition: "NM",
      inStock: true,
      priceType: "sell",
      sourceUrl: "https://thegamesdistrict.com/products/arcane-signet-bloomburrow-commander",
    });
  });

  it("still drops non-NM variants after conversion", () => {
    const node = productNode({
      variants: {
        edges: [
          { node: variantNode({ title: "Near Mint" }) },
          {
            node: variantNode({
              title: "Lightly Played",
              selectedOptions: [{ name: "Condition", value: "Lightly Played" }],
            }),
          },
        ],
        pageInfo: { hasNextPage: false },
      },
    });
    expect(mapProduct(toShopifyProduct(node), config)).toHaveLength(1);
  });

  it("still rejects tokens after conversion", () => {
    const node = productNode({ title: "Treasure Token [Bloomburrow Commander]" });
    expect(mapProduct(toShopifyProduct(node), config)).toEqual([]);
  });

  it("carries an out-of-stock NM variant through as inStock false", () => {
    // The available:true filter is per product, not per variant: a product whose
    // LP is in stock but NM is not still arrives, and must not be priced as live.
    const node = productNode({
      variants: {
        edges: [{ node: variantNode({ availableForSale: false }) }],
        pageInfo: { hasNextPage: false },
      },
    });
    expect(mapProduct(toShopifyProduct(node), config)[0].inStock).toBe(false);
  });
});

// ─── storefrontUrl ────────────────────────────────────────────────────────────

describe("storefrontUrl", () => {
  it("builds the pinned versioned endpoint", () => {
    expect(storefrontUrl("https://thegamesdistrict.com"))
      .toBe(`https://thegamesdistrict.com/api/${STOREFRONT_API_VERSION}/graphql.json`);
  });
});
