import { describe, it, expect } from "vitest";
import {
  parseSearchParams, toQueryString, toggleFilter, activeChips, clearFilters, facetValueLabel,
} from "./params.js";

describe("parseSearchParams", () => {
  it("applies defaults", () => {
    const s = parseSearchParams({ q: " bolt " });
    expect(s).toMatchObject({ q: "bolt", view: "printing", sort: "price_asc", page: 1 });
    expect(s.filters.store).toEqual([]);
  });

  it("splits, trims and dedupes list params", () => {
    expect(parseSearchParams({ store: "a, b,,a" }).filters.store).toEqual(["a", "b"]);
  });

  it("rejects unknown view, sort and bad pages", () => {
    const s = parseSearchParams({ view: "grid", sort: "random", page: "-3" });
    expect(s).toMatchObject({ view: "printing", sort: "price_asc", page: 1 });
  });

  it("falls back to the remembered view only when the URL has none", () => {
    expect(parseSearchParams({}, "card").view).toBe("card");
    expect(parseSearchParams({ view: "all" }, "card").view).toBe("all");
    expect(parseSearchParams({}, "bogus").view).toBe("printing");
  });

  it("ignores the retired stock param", () => {
    expect(toQueryString(parseSearchParams({ q: "bolt", stock: "any" }))).toBe("q=bolt");
  });

  it("takes the first value of a repeated param", () => {
    expect(parseSearchParams({ q: ["a", "b"] }).q).toBe("a");
  });
});

describe("toQueryString", () => {
  it("omits defaults", () => {
    expect(toQueryString(parseSearchParams({ q: "bolt" }))).toBe("q=bolt");
  });

  it("round-trips a full state", () => {
    const qs = "q=bolt&view=all&sort=name&store=a%2Cb&set=mh3&page=3";
    expect(toQueryString(parseSearchParams(Object.fromEntries(new URLSearchParams(qs))))).toBe(qs);
  });
});

describe("toggleFilter", () => {
  it("adds, removes, and resets to page 1", () => {
    const s = { ...parseSearchParams({ q: "bolt" }), page: 4 };
    const added = toggleFilter(s, "finish", "foil");
    expect(added.filters.finish).toEqual(["foil"]);
    expect(added.page).toBe(1);
    expect(toggleFilter(added, "finish", "foil").filters.finish).toEqual([]);
  });
});

describe("activeChips / clearFilters", () => {
  it("lists every active value and clears them all", () => {
    const s = parseSearchParams({ set: "mh3", finish: "foil,etched" });
    expect(activeChips(s)).toEqual([
      { key: "set", value: "mh3" }, { key: "finish", value: "foil" }, { key: "finish", value: "etched" },
    ]);
    expect(activeChips(clearFilters(s))).toEqual([]);
  });
});

describe("facetValueLabel", () => {
  it("maps enum values and prefers DB labels otherwise", () => {
    expect(facetValueLabel("finish", "nonfoil")).toBe("Non-foil");
    expect(facetValueLabel("store", "mtg_mate", "MTG Mate")).toBe("MTG Mate");
  });
});
