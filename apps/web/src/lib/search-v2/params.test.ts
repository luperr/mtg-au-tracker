import { describe, it, expect } from "vitest";
import {
  parseSearchParams, toQueryString, toggleFilter, activeFilterCount, clearFilters, facetValueLabel,
  priceFilterApplies, stickyFilters, describeRefinement, setPrice,
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
    expect(parseSearchParams({ view: "listings" }, "card").view).toBe("listings");
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
    const qs = "q=bolt&view=listings&sort=name&store=a%2Cb&set=mh3&page=3";
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

describe("activeFilterCount / clearFilters", () => {
  it("counts every ticked value plus a remembered price range, and clears them all", () => {
    const s = parseSearchParams({ set: "mh3", finish: "foil,etched", min: "5" });
    expect(activeFilterCount(s)).toBe(4);
    expect(activeFilterCount({ ...s, view: "card" })).toBe(4);
    expect(activeFilterCount(clearFilters(s))).toBe(0);
  });
});

describe("facetValueLabel", () => {
  it("maps enum values and prefers DB labels otherwise", () => {
    expect(facetValueLabel("finish", "nonfoil")).toBe("Non-foil");
    expect(facetValueLabel("store", "mtg_mate", "MTG Mate")).toBe("MTG Mate");
  });
});

describe("price range", () => {
  it("rounds to cents, drops junk and swaps a reversed range", () => {
    expect(parseSearchParams({ min: "1.234", max: "abc" }).price).toEqual({ min: 1.23, max: null });
    expect(parseSearchParams({ min: "-5" }).price).toEqual({ min: null, max: null });
    expect(parseSearchParams({ min: "20", max: "5" }).price).toEqual({ min: 5, max: 20 });
  });

  it("round-trips through the query string and is cleared with the filters", () => {
    const s = parseSearchParams({ q: "bolt", min: "5", max: "20" });
    expect(toQueryString(s)).toBe("q=bolt&min=5&max=20");
    expect(clearFilters(s).price).toEqual({ min: null, max: null });
  });

  it("applies outside card view only", () => {
    expect(priceFilterApplies(parseSearchParams({ min: "5", view: "printing" }))).toBe(true);
    expect(priceFilterApplies(parseSearchParams({ min: "5", view: "card" }))).toBe(false);
    expect(priceFilterApplies(parseSearchParams({ view: "listings" }))).toBe(false);
  });

});

describe("treatment", () => {
  it("drops the default treatment from the URL", () => {
    expect(parseSearchParams({ treatment: "normal,borderless" }).filters.treatment).toEqual(["borderless"]);
  });
});

describe("filters carried across searches", () => {
  it("keeps sticky facets and price, but not set", () => {
    const s = parseSearchParams({ q: "bolt", store: "a,b", set: "mh3", condition: "NM", min: "5" });
    expect(stickyFilters(s)).toBe("store=a%2Cb&condition=NM&min=5");
  });

  it("applies remembered filters only when the URL names none", () => {
    const remembered = "store=a&min=5";
    expect(parseSearchParams({ q: "bolt" }, undefined, remembered)).toMatchObject({
      filters: { store: ["a"] }, price: { min: 5, max: null },
    });
    const own = parseSearchParams({ q: "bolt", finish: "foil" }, undefined, remembered);
    expect(own.filters.store).toEqual([]);
    expect(own.price.min).toBeNull();
  });
});

describe("describeRefinement", () => {
  const base = parseSearchParams({ q: "bolt", store: "mtg_mate" });

  it("ignores a new query and page-only changes", () => {
    expect(describeRefinement(base, { ...base, q: "counterspell" })).toBeNull();
    expect(describeRefinement(base, { ...base, page: 2 })).toBeNull();
    expect(describeRefinement(base, base)).toBeNull();
  });

  it("reports view and sort with their new value", () => {
    expect(describeRefinement(base, { ...base, view: "card" })).toEqual({ kind: "view", value: "card" });
    expect(describeRefinement(base, { ...base, sort: "name" })).toEqual({ kind: "sort", value: "name" });
  });

  it("reports a single facet tick or untick", () => {
    expect(describeRefinement(base, toggleFilter(base, "finish", "foil")))
      .toEqual({ kind: "facet-add", key: "finish", value: "foil" });
    expect(describeRefinement(base, toggleFilter(base, "store", "mtg_mate")))
      .toEqual({ kind: "facet-remove", key: "store", value: "mtg_mate" });
  });

  it("reports clear when every filter goes at once", () => {
    const busy = setPrice(toggleFilter(base, "finish", "foil"), { min: 1, max: null });
    expect(describeRefinement(busy, clearFilters(busy))).toEqual({ kind: "clear" });
  });

  it("reports a price change", () => {
    expect(describeRefinement(base, setPrice(base, { min: null, max: 5 }))).toEqual({ kind: "price" });
  });
});
