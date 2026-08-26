import { describe, it, expect } from "vitest";
import { applyAffiliateParams, buildCustomId, EBAY_STORE_ID } from "./affiliate";

const CAMPAIGN = "5339012345";
const ROTATION = "705-53470-19255-0";
const ITEM_URL = "https://www.ebay.com.au/itm/1234567890";

const opts = { campaignId: CAMPAIGN, rotationId: ROTATION };

function params(url: string) {
  return new URL(url).searchParams;
}

describe("applyAffiliateParams", () => {
  it("leaves non-eBay store links untouched", () => {
    const url = "https://mtgmate.com.au/products/lightning-bolt";
    expect(applyAffiliateParams(url, "mtg_mate", opts)).toBe(url);
  });

  it("leaves eBay links untouched when no campaign id is configured", () => {
    expect(applyAffiliateParams(ITEM_URL, EBAY_STORE_ID, { campaignId: null })).toBe(ITEM_URL);
    expect(applyAffiliateParams(ITEM_URL, EBAY_STORE_ID, { campaignId: "   " })).toBe(ITEM_URL);
  });

  it("adds the full EPN parameter set to eBay links", () => {
    const p = params(applyAffiliateParams(ITEM_URL, EBAY_STORE_ID, opts));
    expect(p.get("mkevt")).toBe("1");
    expect(p.get("mkcid")).toBe("1");
    expect(p.get("mkrid")).toBe(ROTATION);
    expect(p.get("siteid")).toBe("15");
    expect(p.get("campid")).toBe(CAMPAIGN);
    expect(p.get("toolid")).toBe("10001");
  });

  it("keeps the item path and any pre-existing query params", () => {
    const withQuery = `${ITEM_URL}?hash=item1c0ffee%3Ag%3AabcAAOSw&var=987654321`;
    const out = applyAffiliateParams(withQuery, EBAY_STORE_ID, opts);
    expect(new URL(out).pathname).toBe("/itm/1234567890");
    expect(params(out).get("hash")).toBe("item1c0ffee:g:abcAAOSw");
    expect(params(out).get("var")).toBe("987654321");
    expect(params(out).get("campid")).toBe(CAMPAIGN);
  });

  it("falls back to the default rotation id when none is supplied", () => {
    const out = applyAffiliateParams(ITEM_URL, EBAY_STORE_ID, { campaignId: CAMPAIGN });
    expect(params(out).get("mkrid")).toBe(ROTATION);
  });

  it("includes customid only when one is given", () => {
    const withId = applyAffiliateParams(ITEM_URL, EBAY_STORE_ID, { ...opts, customId: "card-detail-abc" });
    expect(params(withId).get("customid")).toBe("card-detail-abc");

    for (const customId of [undefined, null, "  "]) {
      const out = applyAffiliateParams(ITEM_URL, EBAY_STORE_ID, { ...opts, customId });
      expect(params(out).has("customid")).toBe(false);
    }
  });

  it("returns a malformed url unchanged rather than throwing", () => {
    const junk = "not a url at all";
    expect(() => applyAffiliateParams(junk, EBAY_STORE_ID, opts)).not.toThrow();
    expect(applyAffiliateParams(junk, EBAY_STORE_ID, opts)).toBe(junk);
  });
});

describe("buildCustomId", () => {
  it("joins the source and printing id", () => {
    expect(buildCustomId("card-detail", "6f2a1b3c")).toBe("card-detail-6f2a1b3c");
  });

  it("falls back to the source alone when there is no printing id", () => {
    expect(buildCustomId("want-list")).toBe("want-list");
    expect(buildCustomId("want-list", null)).toBe("want-list");
  });

  it("replaces characters EPN does not accept", () => {
    expect(buildCustomId("card detail", "a/b?c=d")).toBe("card-detail-a-b-c-d");
  });

  it("truncates to EPN's 256-character cap", () => {
    const out = buildCustomId("card-detail", "x".repeat(500));
    expect(out).toHaveLength(256);
  });

  it("returns null when there is nothing to send", () => {
    expect(buildCustomId("")).toBeNull();
  });
});
