/**
 * Validates all Shopify store configurations against their live endpoints.
 *
 * For each store in SHOPIFY_STORES:
 *   1. Probes the collection endpoint (HTTP status check)
 *   2. Fetches page 1 (250 products) to count available products
 *   3. Runs products through mapProduct to count how many cards are extracted
 *   4. Reports issues: ENDPOINT_404, EMPTY_COLLECTION, PARSER_REJECTS_ALL
 *
 * Usage:
 *   pnpm --filter @mtg-au/scraper validate:all-stores
 *
 * Exit code 1 if any store has a critical issue.
 */

import { SHOPIFY_STORES } from "../stores/shopify-stores.config.js";
import { mapProduct, isTokenOrEmblem } from "../stores/shopify.js";

const PAGE_SIZE = 250;
const FETCH_TIMEOUT_MS = 15_000;

type IssueCode = "ENDPOINT_404" | "FETCH_ERROR" | "EMPTY_COLLECTION" | "PARSER_REJECTS_ALL" | "LOW_SET_COVERAGE";

interface StoreResult {
  id: string;
  baseUrl: string;
  handle: string;
  httpStatus: number | null;
  fetchError: string | null;
  totalProducts: number;
  mappedCards: number;
  skippedTokens: number;
  setNameCoverage: number | null; // fraction of cards with a non-null setName, or null if no cards
  issues: IssueCode[];
}

async function probeStore(id: string, baseUrl: string, handle: string): Promise<StoreResult> {
  const url = `${baseUrl}/collections/${handle}/products.json?limit=${PAGE_SIZE}&page=1`;
  const result: StoreResult = {
    id,
    baseUrl,
    handle,
    httpStatus: null,
    fetchError: null,
    totalProducts: 0,
    mappedCards: 0,
    skippedTokens: 0,
    setNameCoverage: null,
    issues: [],
  };

  let products: { title: string; tags: string[]; options: unknown[]; variants: unknown[] }[] = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": process.env.USER_AGENT ?? "Scrymarket/1.0 (store-validator)" },
    });
    clearTimeout(timeout);

    result.httpStatus = res.status;

    if (!res.ok) {
      result.issues.push("ENDPOINT_404");
      return result;
    }

    const data = (await res.json()) as { products?: typeof products };
    products = data.products ?? [];
  } catch (err: unknown) {
    result.fetchError = err instanceof Error ? err.message : String(err);
    result.issues.push("FETCH_ERROR");
    return result;
  }

  result.totalProducts = products.length;

  if (products.length === 0) {
    result.issues.push("EMPTY_COLLECTION");
    return result;
  }

  // Run through mapProduct to count how many cards we'd extract
  let withSetName = 0;
  for (const product of products) {
    if (isTokenOrEmblem(product as Parameters<typeof isTokenOrEmblem>[0])) {
      result.skippedTokens++;
      continue;
    }
    const cards = mapProduct(product as Parameters<typeof mapProduct>[0], baseUrl);
    result.mappedCards += cards.length;
    for (const c of cards) {
      if (c.setName || c.setCode) withSetName++;
    }
  }

  if (result.mappedCards === 0 && result.totalProducts > 0) {
    result.issues.push("PARSER_REJECTS_ALL");
  }

  if (result.mappedCards > 0) {
    result.setNameCoverage = withSetName / result.mappedCards;
    if (result.setNameCoverage < 0.5) {
      result.issues.push("LOW_SET_COVERAGE");
    }
  }

  return result;
}

function statusIcon(r: StoreResult): string {
  if (r.issues.length === 0) return "✓";
  if (r.issues.includes("ENDPOINT_404") || r.issues.includes("FETCH_ERROR") || r.issues.includes("PARSER_REJECTS_ALL")) return "✗";
  return "⚠";
}

async function main() {
  console.error(`Validating ${SHOPIFY_STORES.length} Shopify stores...\n`);

  const results: StoreResult[] = [];
  let criticalCount = 0;

  for (const store of SHOPIFY_STORES) {
    process.stderr.write(`  ${store.id.padEnd(35)} `);
    const result = await probeStore(store.id, store.baseUrl, store.collectionHandle);
    results.push(result);

    const icon = statusIcon(result);
    if (result.issues.includes("ENDPOINT_404") || result.issues.includes("FETCH_ERROR") || result.issues.includes("PARSER_REJECTS_ALL")) {
      criticalCount++;
    }
    process.stderr.write(`${icon}\n`);
  }

  // ── Human-readable table ──────────────────────────────────────────────────
  console.error(`\n${"─".repeat(100)}`);
  console.error(
    `${"Store".padEnd(35)} ${"HTTP".padEnd(6)} ${"Products".padEnd(10)} ${"Mapped".padEnd(8)} ${"Set%".padEnd(7)} Issues`,
  );
  console.error(`${"─".repeat(100)}`);

  for (const r of results) {
    const http = r.httpStatus !== null ? String(r.httpStatus) : r.fetchError ? "ERR" : "—";
    const products = r.httpStatus === 200 ? String(r.totalProducts) : "—";
    const mapped = r.mappedCards > 0 ? String(r.mappedCards) : r.httpStatus === 200 ? "0" : "—";
    const setCoverage = r.setNameCoverage !== null ? `${(r.setNameCoverage * 100).toFixed(0)}%` : "—";
    const issues = r.issues.length > 0 ? r.issues.join(", ") : "—";

    console.error(
      `${r.id.padEnd(35)} ${http.padEnd(6)} ${products.padEnd(10)} ${mapped.padEnd(8)} ${setCoverage.padEnd(7)} ${issues}`,
    );
  }
  console.error(`${"─".repeat(100)}`);
  console.error(`${results.filter((r) => r.issues.length === 0).length} OK  |  ${criticalCount} critical  |  ${results.filter((r) => r.issues.some((i) => i === "LOW_SET_COVERAGE")).length} warnings`);

  // ── Machine-readable JSON to stdout ──────────────────────────────────────
  console.log(JSON.stringify(results, null, 2));

  process.exit(criticalCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
