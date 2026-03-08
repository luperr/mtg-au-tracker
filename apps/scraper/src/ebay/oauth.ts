/**
 * eBay OAuth 2.0 — Client Credentials flow.
 *
 * Exchanges EBAY_CLIENT_ID + EBAY_CLIENT_SECRET for a short-lived access token
 * (typically 2 hours). The token is cached in memory and refreshed automatically
 * when it expires, so callers just call getAccessToken() and always get a valid one.
 *
 * eBay API docs: https://developer.ebay.com/api-docs/static/oauth-client-credentials-grant.html
 *
 * Environment variables required:
 *   EBAY_CLIENT_ID      — App ID from eBay Developer Program
 *   EBAY_CLIENT_SECRET  — Cert ID from eBay Developer Program
 *   EBAY_ENV            — "production" (default) or "sandbox"
 *
 * Test: run directly with `tsx src/ebay/oauth.ts` — prints the token.
 */

const TOKEN_URL = {
  production: "https://api.ebay.com/identity/v1/oauth2/token",
  sandbox: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
};

// eBay AU marketplace ID — scopes all Browse API calls to eBay Australia
export const MARKETPLACE_ID = "EBAY_AU";

interface TokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: string;
}

interface CachedToken {
  token: string;
  expiresAt: number; // Date.now() ms
}

let cached: CachedToken | null = null;

/**
 * Returns a valid eBay OAuth access token, fetching a fresh one if needed.
 * Tokens are cached in memory — no DB or file storage needed.
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if it has > 60 seconds remaining
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing eBay credentials. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env",
    );
  }

  const env = (process.env.EBAY_ENV ?? "production") as "production" | "sandbox";
  const url = TOKEN_URL[env];

  // Basic auth: base64(clientId:clientSecret)
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`eBay OAuth failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as TokenResponse;
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  console.log(`[eBay OAuth] New token obtained (expires in ${data.expires_in}s)`);
  return cached.token;
}

// ── Run directly to test ───────────────────────────────────────────────────────
// tsx src/ebay/oauth.ts
if (process.argv[1]?.endsWith("oauth.ts") || process.argv[1]?.endsWith("oauth.js")) {
  const { config } = await import("dotenv");
  config({ path: new URL("../../../../.env", import.meta.url).pathname });

  try {
    const token = await getAccessToken();
    console.log("\nSuccess! Token (first 40 chars):", token.slice(0, 40) + "...");
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}
