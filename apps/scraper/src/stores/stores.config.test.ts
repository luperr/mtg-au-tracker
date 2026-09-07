import { describe, it, expect } from "vitest";
import { STORE_REGISTRY, shopifyStores, crystalCommerceStores } from "./stores.config.js";

describe("stores.config", () => {
  it("has unique store ids", () => {
    const ids = STORE_REGISTRY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // run-store.ts builds its scraper from these lists without re-checking the DB gate,
  // so a disabled store leaking through here is a store scraped without permission.
  it("excludes disabled stores from the Shopify scraper list", () => {
    const disabled = new Set(STORE_REGISTRY.filter((s) => !s.scraperEnabled).map((s) => s.id));
    expect(disabled.size).toBeGreaterThan(0);
    for (const store of shopifyStores()) expect(disabled.has(store.id)).toBe(false);
  });

  it("excludes disabled stores from the CrystalCommerce scraper list", () => {
    const disabled = new Set(STORE_REGISTRY.filter((s) => !s.scraperEnabled).map((s) => s.id));
    for (const store of crystalCommerceStores()) expect(disabled.has(store.id)).toBe(false);
  });

  it("keeps every enabled platform store in its scraper list", () => {
    const listed = new Set([...shopifyStores(), ...crystalCommerceStores()].map((s) => s.id));
    const expected = STORE_REGISTRY.filter((s) => s.scraperEnabled && (s.shopify ?? s.crystalCommerce));
    for (const store of expected) expect(listed.has(store.id)).toBe(true);
  });
});
