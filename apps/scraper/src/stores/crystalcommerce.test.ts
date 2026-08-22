import { describe, it, expect } from "vitest";
import {
  parseProductTitle,
  parseVariantDescription,
  parsePrice,
  parseCategoryLinks,
  parseCategoryPage,
  hasNextPage,
  setNameFromSlug,
} from "./crystalcommerce.js";

// Trimmed from a real The Games Cube category page. Keeps the nesting that
// matters: the grid/list blocks (priciest variant only) plus the .variants
// detail block (every variant), so the parser is proven to read the right one.
function productHtml(opts: {
  title: string;
  href: string;
  variants: { desc: string; price: string; category: string; noStock?: boolean }[];
}): string {
  const variantRows = opts.variants
    .map(
      (v) => `
    <div class="variant-row row${v.noStock ? " no-stock" : ""}">
      <span class="variant-main-info">
        <span class="variant-short-info variant-description">${v.desc}</span>
        <span class="variant-short-info variant-qty"> 2 In Stock </span>
      </span>
      <span class="variant-buttons">
        <form class="add-to-cart-form" data-vid="8649314" data-name="${opts.title}"
              data-id="693701" data-price="${v.price}" data-category="${v.category}"
              data-variant="${v.desc}">
          <div class="product-price-qty"><span class="regular price">${v.price}</span></div>
        </form>
      </span>
    </div>`,
    )
    .join("");

  return `
  <li class="product" itemscope itemtype="http://schema.org/Product">
    <div class="inner">
      <div class="image-meta">
        <div class="image">
          <a href="${opts.href}" itemprop="url" title="${opts.title}"><img src="x.jpg"></a>
        </div>
        <div class="meta">
          <h4 class="name small-12 medium-4" itemprop="name" title="${opts.title}">${opts.title}</h4>
          <div class="list-variants grid">
            <div class="variant-row"><span class="price">AUD$ 999.00</span></div>
          </div>
        </div>
      </div>
      <div class="variants">${variantRows}</div>
    </div>
  </li>`;
}

function pageHtml(products: string): string {
  return `<html><body><ul class="products">${products}</ul></body></html>`;
}

describe("parseProductTitle", () => {
  it("returns a plain name unchanged", () => {
    expect(parseProductTitle("Agate Assault")).toEqual({
      cardName: "Agate Assault",
      collectorNumber: null,
      finish: "nonfoil",
      treatment: undefined,
    });
  });

  it("reads a foil suffix", () => {
    const result = parseProductTitle("Banishing Light - Foil");
    expect(result.cardName).toBe("Banishing Light");
    expect(result.finish).toBe("foil");
  });

  it("reads stacked finish + treatment suffixes", () => {
    expect(parseProductTitle("Genku, Future Shaper - Foil - Borderless")).toEqual({
      cardName: "Genku, Future Shaper",
      collectorNumber: null,
      finish: "foil",
      treatment: "borderless",
    });
  });

  it("maps etched and extended art", () => {
    expect(parseProductTitle("Genku, Future Shaper - Foil Etched").finish).toBe("etched");
    expect(parseProductTitle("Argent Dais - Extended Art").treatment).toBe("extendedart");
    expect(parseProductTitle("Guide of Souls - Showcase").treatment).toBe("showcase");
  });

  it("treats special foils as foil without asserting a treatment", () => {
    const result = parseProductTitle("Ajani, Nacatl Pariah // Ajani, Nacatl Avenger - Textured Foil - Borderless");
    expect(result.cardName).toBe("Ajani, Nacatl Pariah // Ajani, Nacatl Avenger");
    expect(result.finish).toBe("foil");
    expect(result.treatment).toBe("borderless");
  });

  it("keeps unrecognised ' - ' segments in the card name", () => {
    // Real card names contain dashes; only the known vocabulary may be stripped.
    const result = parseProductTitle("Helm's Deep - Shinka, the Bloodsoaked Keep - Foil");
    expect(result.cardName).toBe("Helm's Deep - Shinka, the Bloodsoaked Keep");
    expect(result.finish).toBe("foil");
  });

  it("extracts a zero-padded collector number", () => {
    expect(parseProductTitle("Kaalia of the Vast (0343) - Borderless")).toEqual({
      cardName: "Kaalia of the Vast",
      collectorNumber: "343",
      finish: "nonfoil",
      treatment: "borderless",
    });
  });
});

describe("parseVariantDescription", () => {
  it("normalises CrystalCommerce condition names", () => {
    expect(parseVariantDescription("NM-Mint, English")?.condition).toBe("NM");
    expect(parseVariantDescription("Light Play, English")?.condition).toBe("LP");
    expect(parseVariantDescription("Heavy Play, English")?.condition).toBe("HP");
  });

  it("defaults to English when no language is given", () => {
    expect(parseVariantDescription("NM-Mint")).toEqual({ condition: "NM", language: "English" });
  });

  it("rejects non-English variants", () => {
    expect(parseVariantDescription("NM-Mint, Japanese")).toBeNull();
    expect(parseVariantDescription("")).toBeNull();
  });

  // normaliseCondition echoes anything it doesn't recognise, so without an
  // explicit check these land in store_prices.condition and show up in the web
  // UI's condition filter.
  it("rejects rows whose first field is not a condition", () => {
    expect(parseVariantDescription("All variants")).toBeNull();
    expect(parseVariantDescription("Add to Cart, English")).toBeNull();
    expect(parseVariantDescription("$4.50, English")).toBeNull();
  });
});

describe("parsePrice", () => {
  it("strips the currency prefix and thousands separators", () => {
    expect(parsePrice("AUD$ 760.00")).toBe("760.00");
    expect(parsePrice("AUD$ 1,760.00")).toBe("1760.00");
  });

  it("returns null when there is no price", () => {
    expect(parsePrice("Out of stock.")).toBeNull();
  });
});

describe("parseCategoryLinks", () => {
  const html = `
    <a href="/catalog/magic_singles/5734">All</a>
    <a href="/catalog/magic_singles_12/8">Other tree</a>
    <a href="/catalog/magic_singles-standard-bloomburrow/6088">Bloomburrow</a>
    <a href="/catalog/magic_singles-standard-bloomburrow/6088">Bloomburrow again</a>
    <a href="/catalog/magic_singles-art_cards-bloomburrow_art_cards/6086">Art</a>
    <a href="/catalog/magic_singles-modern-modern_horizons_3/6079">MH3</a>
    <a href="/catalog/magic_products-commander_decks/3773">Sealed</a>
    <a href="/catalog/magic_singles-standard-bloomburrow/alania_divergent_storm/693640">Product</a>`;

  it("collects leaf categories only, deduped", () => {
    expect(parseCategoryLinks(html, "magic_singles")).toEqual([
      { slug: "magic_singles-standard-bloomburrow", id: "6088" },
      { slug: "magic_singles-modern-modern_horizons_3", id: "6079" },
    ]);
  });

  // The mega-menu links its grouping levels too. An intermediate node lists
  // every product under all of its children, so scraping it blows through
  // maxPagesPerCategory and duplicates every leaf category's listings.
  it("drops intermediate nav nodes that are ancestors of other categories", () => {
    const withParents = `
      <a href="/catalog/magic_singles-standard/6000">Standard</a>
      <a href="/catalog/magic_singles-standard-bloomburrow/6088">Bloomburrow</a>
      <a href="/catalog/magic_singles-modern/6001">Modern</a>
      <a href="/catalog/magic_singles-modern-modern_horizons_3/6079">MH3</a>`;

    expect(parseCategoryLinks(withParents, "magic_singles")).toEqual([
      { slug: "magic_singles-standard-bloomburrow", id: "6088" },
      { slug: "magic_singles-modern-modern_horizons_3", id: "6079" },
    ]);
  });

  // Only a "-" boundary counts as ancestry — a shared prefix isn't a parent.
  it("keeps categories whose slug is merely a prefix of another", () => {
    const siblings = `
      <a href="/catalog/magic_singles-standard-bloom/6001">Bloom</a>
      <a href="/catalog/magic_singles-standard-bloomburrow/6088">Bloomburrow</a>`;

    expect(parseCategoryLinks(siblings, "magic_singles")).toHaveLength(2);
  });
});

describe("parseCategoryPage", () => {
  const baseUrl = "https://www.thegamescube.com";

  it("yields one card per in-stock variant, reading the detail block", () => {
    const html = pageHtml(
      productHtml({
        title: "Baylen, the Haymaker - Raised Foil - Borderless",
        href: "/catalog/magic_singles-standard-bloomburrow_variants/baylen/693701",
        variants: [
          { desc: "NM-Mint, English", price: "AUD$ 760.00", category: "Bloomburrow Variants" },
          { desc: "Light Play, English", price: "AUD$ 600.00", category: "Bloomburrow Variants" },
        ],
      }),
    );

    const cards = parseCategoryPage(html, baseUrl, "Fallback Set");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      rawName: "Baylen, the Haymaker",
      setCode: null,
      setName: "Bloomburrow Variants",
      collectorNumber: null,
      price: "760.00",
      priceType: "sell",
      condition: "NM",
      isFoil: true,
      finish: "foil",
      treatment: "borderless",
      inStock: true,
      sourceUrl: `${baseUrl}/catalog/magic_singles-standard-bloomburrow_variants/baylen/693701`,
    });
    expect(cards[1].condition).toBe("LP");
    expect(cards[1].price).toBe("600.00");
  });

  it("skips out-of-stock and non-English variants", () => {
    const html = pageHtml(
      productHtml({
        title: "Agate Assault",
        href: "/catalog/magic_singles-standard-bloomburrow/agate/1",
        variants: [
          { desc: "All variants", price: "AUD$ 667.17", category: "Bloomburrow", noStock: true },
          { desc: "NM-Mint, Japanese", price: "AUD$ 12.00", category: "Bloomburrow" },
          { desc: "NM-Mint, English", price: "AUD$ 1.50", category: "Bloomburrow" },
        ],
      }),
    );

    const cards = parseCategoryPage(html, baseUrl, "Fallback Set");
    expect(cards).toHaveLength(1);
    expect(cards[0].price).toBe("1.50");
  });

  it("reads names containing quotes, which CrystalCommerce truncates in the title attribute", () => {
    // Real markup: title="Kongming, "Sleeping Dragon" - Foil" — unescaped quotes.
    const html = pageHtml(`
      <li class="product">
        <div class="image"><a href="/catalog/x/kongming/1"></a></div>
        <div class="meta">
          <h4 class="name" itemprop="name" title="Kongming, "Sleeping Dragon" - Foil">Kongming, "Sleeping Dragon" - Foil</h4>
        </div>
        <div class="variants">
          <div class="variant-row row">
            <span class="variant-short-info variant-description">NM-Mint, English</span>
            <form class="add-to-cart-form" data-price="AUD$ 3.00" data-category="Portal Three Kingdoms"></form>
          </div>
        </div>
      </li>`);

    const cards = parseCategoryPage(html, baseUrl, "Fallback Set");
    expect(cards).toHaveLength(1);
    expect(cards[0].rawName).toBe('Kongming, "Sleeping Dragon"');
    expect(cards[0].finish).toBe("foil");
  });

  it("falls back to the slug-derived set name when data-category is absent", () => {
    const html = pageHtml(
      productHtml({
        title: "Agate Assault",
        href: "/catalog/x/1",
        variants: [{ desc: "NM-Mint, English", price: "AUD$ 1.50", category: "" }],
      }),
    );

    expect(parseCategoryPage(html, baseUrl, "Bloomburrow")[0].setName).toBe("Bloomburrow");
  });
});

describe("hasNextPage", () => {
  it("detects the next-page link", () => {
    expect(hasNextPage('<a href="/catalog/x/1?page=2" class="next_page">Next</a>')).toBe(true);
    expect(hasNextPage('<div class="pagination"><span class="current">1</span></div>')).toBe(false);
  });
});

describe("setNameFromSlug", () => {
  it("titles the leaf segment", () => {
    expect(setNameFromSlug("magic_singles-standard-bloomburrow_variants")).toBe("Bloomburrow Variants");
    expect(setNameFromSlug("magic_singles-other_magic_sets-fbb")).toBe("Fbb");
  });
});
