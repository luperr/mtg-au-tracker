import { describe, it, expect } from "vitest";
import { parseSetCategories, parseRecordCount, parsePrice, parseProductPage } from "./cardtastic.js";

// Trimmed from the real singles category page: the breadcrumb, then the
// per-set tile grid (each tile links twice — image and heading).
const SINGLES_PAGE = `
<h1><span id="ctl00_ctPublic_lblHeading"><a href='category-card-games-8.aspx'>Card Games</a>
  <span class="cat_breadcrumb_separator">&raquo;</span> <a href='category-magic-the-gathering-2.aspx'>Magic the Gathering</a>
  <span class="cat_breadcrumb_separator">&raquo;</span> Single Cards</span></h1>
<div class="col-md-3 margin40"><div class="product-col">
  <center><a href='category-lorwyn-556.aspx'><img src='/database/images/lorwyn.png' /></a></center>
  <div class="product-desc-sh"><h4><a href='category-lorwyn-556.aspx'>Lorwyn</a></h4></div>
</div></div>
<div class="col-md-3 margin40"><div class="product-col">
  <center><a href='category-duskmourn-house-of-horror-1156.aspx'><img src='/database/images/dsk.png' /></a></center>
  <div class="product-desc-sh"><h4><a href='category-duskmourn-house-of-horror-1156.aspx'>Duskmourn: House of Horror</a></h4></div>
</div></div>
<input type="hidden" name="ctl00$ctPublic$lblRecCount" id="ctl00_ctPublic_lblRecCount" value="0" />`;

// Trimmed from a real Bloomburrow page: one in-stock tile, one sold out.
function tile(opts: { href: string; name: string; price: string; soldOut?: boolean }): string {
  const action = opts.soldOut
    ? `<div style="color: red; font-weight: bold; margin-bottom: 20px;">SOLD OUT</div>`
    : `<a id="ctl00_ctPublic_rpProds_ctl13_btnAddToCart" class="btn btn-default" href="javascript:__doPostBack('x','')"><i class="fa fa-shopping-cart"></i>Add to Cart</a>`;
  return `
  <div class="col-md-3 margin40"><div class="product-col">
    <a href='${opts.href}'><img src='database/images/thumb.jpg' class="img-responsive" /></a>
    <div class="product-desc-sh"> Bloomburrow<br />
      <h4 style="min-height: 46px;"><a href='${opts.href}'>${opts.name}</a></h4>
      <span>${opts.price}</span>
      ${action}
      <a href='${opts.href}' class="btn btn-default"><i class="fa fa-pencil"></i>More Info</a>
    </div>
  </div></div>`;
}

describe("parseSetCategories", () => {
  it("reads the set tiles, once each, and skips the breadcrumb", () => {
    expect(parseSetCategories(SINGLES_PAGE)).toEqual([
      { path: "category-lorwyn-556.aspx", name: "Lorwyn" },
      { path: "category-duskmourn-house-of-horror-1156.aspx", name: "Duskmourn: House of Horror" },
    ]);
  });
});

describe("parseRecordCount", () => {
  it("reads the hidden total", () => {
    expect(parseRecordCount(`<input type="hidden" id="ctl00_ctPublic_lblRecCount" value="246" />`)).toBe(246);
  });

  it("is 0 when the field is missing", () => {
    expect(parseRecordCount("<html></html>")).toBe(0);
  });
});

describe("parsePrice", () => {
  it("strips the dollar sign and thousands separator", () => {
    expect(parsePrice("$1,299.00")).toBe("1299.00");
    expect(parsePrice("$0.23")).toBe("0.23");
  });

  it("returns null without a price", () => {
    expect(parsePrice("Call for price")).toBeNull();
  });
});

describe("parseProductPage", () => {
  const html = `<div class="row" id="prodList">
    ${tile({ href: "product-keen-eyed-curator-62713.aspx", name: "Keen-Eyed Curator", price: "$2.33" })}
    ${tile({ href: "product-bandits-talent-62726.aspx", name: "Bandit&#39;s Talent", price: "$0.50", soldOut: true })}
  </div>`;

  it("reads name, price and stock from each tile", () => {
    const cards = parseProductPage(html, "Bloomburrow");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      rawName: "Keen-Eyed Curator",
      setCode: null,
      setName: "Bloomburrow",
      collectorNumber: null,
      price: "2.33",
      priceType: "sell",
      condition: "NM",
      isFoil: false,
      finish: "nonfoil",
      inStock: true,
      sourceUrl: "https://www.cardtastic.com.au/product-keen-eyed-curator-62713.aspx",
    });
  });

  it("decodes entities and marks sold-out tiles out of stock", () => {
    const [, soldOut] = parseProductPage(html, "Bloomburrow");
    expect(soldOut.rawName).toBe("Bandit's Talent");
    expect(soldOut.inStock).toBe(false);
  });

  it("ignores set tiles, which share the markup but link to a category", () => {
    expect(parseProductPage(SINGLES_PAGE, "x")).toEqual([]);
  });
});
