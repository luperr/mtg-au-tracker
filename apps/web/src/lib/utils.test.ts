import { describe, it, expect } from "vitest";
import { fmtAUD, cardHref, toSmallImage } from "./utils.js";

describe("fmtAUD", () => {
  it("formats a whole number", () => {
    expect(fmtAUD(5)).toBe("$5.00");
  });

  it("formats a decimal amount", () => {
    expect(fmtAUD(4.5)).toBe("$4.50");
  });

  it("rounds to 2 decimal places", () => {
    expect(fmtAUD(1.999)).toBe("$2.00");
  });

  it("formats zero", () => {
    expect(fmtAUD(0)).toBe("$0.00");
  });

  it("formats a large price", () => {
    expect(fmtAUD(1234.5)).toBe("$1234.50");
  });
});

describe("cardHref", () => {
  it("uses slug when present", () => {
    expect(cardHref("lightning-bolt", "abc123")).toBe("/cards/lightning-bolt");
  });

  it("falls back to id when slug is null", () => {
    expect(cardHref(null, "abc123")).toBe("/cards/abc123");
  });

  it("falls back to id when slug is undefined", () => {
    expect(cardHref(undefined, "abc123")).toBe("/cards/abc123");
  });

  it("uses slug even when it matches the id", () => {
    expect(cardHref("abc123", "abc123")).toBe("/cards/abc123");
  });
});

describe("toSmallImage", () => {
  it("converts /normal/ to /small/ in a Scryfall URI", () => {
    expect(toSmallImage("https://cards.scryfall.io/normal/front/a/b/abc.jpg"))
      .toBe("https://cards.scryfall.io/small/front/a/b/abc.jpg");
  });

  it("returns null for null input", () => {
    expect(toSmallImage(null)).toBeNull();
  });

  it("leaves URIs without /normal/ unchanged", () => {
    const uri = "https://cards.scryfall.io/large/front/a/b/abc.jpg";
    expect(toSmallImage(uri)).toBe(uri);
  });
});
