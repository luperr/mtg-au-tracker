import { describe, it, expect } from "vitest";
import { CARD_IMAGE_PATH, proxiedCardSrc } from "./card-image";

const normal = "https://cards.scryfall.io/normal/front/e/8/e89794ab-6070-4916-936f-2b42fe41d31b.jpg?1783906382";

describe("proxiedCardSrc", () => {
  it("maps a Scryfall image to the proxy, keeping its version query", () => {
    expect(proxiedCardSrc(normal)).toBe("/api/scryfall-image/normal/front/e/8/e89794ab-6070-4916-936f-2b42fe41d31b.jpg?1783906382");
  });

  it("swaps in the small rendition for thumbnails", () => {
    expect(proxiedCardSrc(normal, "small")).toBe("/api/scryfall-image/small/front/e/8/e89794ab-6070-4916-936f-2b42fe41d31b.jpg?1783906382");
  });

  it("returns null for anything not on cards.scryfall.io, so it's shown unoptimised instead of failing", () => {
    expect(proxiedCardSrc("https://errors.scryfall.com/soon.jpg")).toBeNull();
    expect(proxiedCardSrc("/bmc-logo.svg")).toBeNull();
  });
});

describe("CARD_IMAGE_PATH", () => {
  it("accepts card-image paths the proxy serves", () => {
    expect(CARD_IMAGE_PATH.test("normal/front/e/8/e89794ab-6070-4916-936f-2b42fe41d31b.jpg")).toBe(true);
    expect(CARD_IMAGE_PATH.test("small/back/0/a/0a1b2c3d-0000-4000-8000-000000000000.jpg")).toBe(true);
  });

  it("rejects anything else, so the proxy can't fetch arbitrary URLs", () => {
    expect(CARD_IMAGE_PATH.test("../../etc/passwd")).toBe(false);
    expect(CARD_IMAGE_PATH.test("normal/front/e/8/x.jpg")).toBe(false);
    expect(CARD_IMAGE_PATH.test("normal/front/e/8/e89794ab-6070-4916-936f-2b42fe41d31b.jpg/../x")).toBe(false);
  });
});
