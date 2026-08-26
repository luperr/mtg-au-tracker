/**
 * Affiliate URL rewriting for outbound store links.
 *
 * Every outbound buy link on the site passes through `applyAffiliateParams()`, so
 * this is the single place a new affiliate deal gets wired up. Currently only eBay
 * AU (eBay Partner Network) is live; the Shopify/CrystalCommerce stores have no
 * affiliate programme yet.
 */

import {
  EBAY_AFFILIATE_ROTATION_ID_DEFAULT,
  EBAY_AFFILIATE_SITE_ID,
  EBAY_AFFILIATE_TOOL_ID,
} from "./config";

/** Store id for eBay AU in `stores` / `store_prices`. */
export const EBAY_STORE_ID = "ebay_au";

/** EPN caps `customid` at 256 characters. */
const CUSTOM_ID_MAX_LENGTH = 256;

export interface AffiliateConfig {
  /** EPN campaign id. Null/empty means affiliate rewriting is off — links render as-is. */
  campaignId: string | null;
  /** EPN rotation id for the eBay AU site. */
  rotationId: string;
}

/**
 * Read affiliate config from the runtime environment.
 *
 * **Server components only.** `process.env` values that aren't `NEXT_PUBLIC_*` are
 * not available in the browser bundle, and that is deliberate: prod images are built
 * by CI and only pulled on the server, so a build-time-inlined campaign id would need
 * a rebuild to rotate. Server components read this and pass it down (see
 * `AffiliateContext` for the client path).
 */
export function getAffiliateConfig(): AffiliateConfig {
  return {
    campaignId: process.env.EBAY_AFFILIATE_CAMPAIGN_ID?.trim() || null,
    rotationId:
      process.env.EBAY_AFFILIATE_ROTATION_ID?.trim() || EBAY_AFFILIATE_ROTATION_ID_DEFAULT,
  };
}

/**
 * Build an EPN `customid` from the UI surface and the printing being linked to, so
 * EPN reports attribute revenue per card and per surface (e.g. `card-detail-<uuid>`).
 * Returns null when there's nothing meaningful to send.
 */
export function buildCustomId(source: string, printingId?: string | null): string | null {
  const raw = printingId ? `${source}-${printingId}` : source;
  const sanitized = raw.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, CUSTOM_ID_MAX_LENGTH);
  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Transform a store URL to include affiliate parameters where applicable.
 * Extend this function as affiliate deals are set up — no call-sites need changing.
 */
export function applyAffiliateParams(
  url: string,
  storeId: string,
  opts: { campaignId: string | null; rotationId?: string; customId?: string | null },
): string {
  if (storeId !== EBAY_STORE_ID) return url;

  const campaignId = opts.campaignId?.trim();
  if (!campaignId) return url;

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    // A malformed stored URL must never break the link — hand back what we were given.
    return url;
  }

  // eBay `itemWebUrl`s routinely carry their own query string (`?hash=…&var=…`),
  // so merge rather than replace.
  u.searchParams.set("mkevt", "1");
  u.searchParams.set("mkcid", "1");
  u.searchParams.set("mkrid", opts.rotationId?.trim() || EBAY_AFFILIATE_ROTATION_ID_DEFAULT);
  u.searchParams.set("siteid", EBAY_AFFILIATE_SITE_ID);
  u.searchParams.set("campid", campaignId);
  u.searchParams.set("toolid", EBAY_AFFILIATE_TOOL_ID);

  const customId = opts.customId?.trim();
  if (customId) u.searchParams.set("customid", customId);

  return u.toString();
}
