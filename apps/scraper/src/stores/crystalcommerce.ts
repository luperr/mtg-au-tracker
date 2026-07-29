/**
 * Generic CrystalCommerce scraper — one class drives any store on the
 * CrystalCommerce platform (Rails), the same way ShopifyScraper drives all the
 * Shopify stores. First store on it: The Games Cube.
 *
 * CrystalCommerce has no products JSON API, so this is HTML scraping. The
 * structure is stable across CC tenants because they all share the platform's
 * "detailed" lookbook template.
 *
 * Strategy:
 *   1. Fetch the homepage. Every MTG singles category is linked from the nav
 *      mega-menu as /catalog/{slug}/{categoryId} — no crawl needed, one request
 *      yields all ~465 category pages.
 *   2. For each category, page through
 *        /catalog/{slug}/{id}?filtered=1&filter_by_stock=in-stock&page=N
 *      The in-stock filter is the important part: it cuts a set from ~120
 *      products across 4 pages down to ~17 on one, so a full run is ~700
 *      requests rather than ~5000. Out-of-stock listings have no price we'd
 *      keep anyway.
 *      Category cache: the same ProbeCache pattern MTG Mate uses. After a full
 *      scan, daily runs only revisit categories that had stock, and a full
 *      rescan every CC_FULL_SCAN_DAYS (default 7) picks up restocks and new
 *      sets. Cache file: SCRAPER_CACHE_DIR/crystalcommerce-{storeId}-categories.json
 *   3. Parse each <li class="product">. The detail-layout .variants block
 *      carries every in-stock variant with its condition, language, price and
 *      quantity; the add-to-cart form's data-* attributes carry the set name.
 *
 * Data notes:
 *   - Set comes from the product's category ("Bloomburrow Variants"), not the
 *     card itself — the matcher's setNameIndex resolves it to a Scryfall code.
 *   - Finish and treatment live in the product title as " - " suffixes drawn
 *     from a fixed vocabulary ("- Foil", "- Foil - Borderless", "- Extended
 *     Art"). Only known suffixes are stripped, because plenty of real card
 *     names contain " - " themselves.
 *   - Non-English variants are skipped — we have no printing-language dimension.
 *   - The server drops connections when pushed, hence the retry loop on top of
 *     BaseScraper's 500ms pacing.
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import { type ScrapedCard, normaliseCondition } from "@mtg-au/shared";
import { BaseScraper } from "./base-scraper.js";
import { logger } from "../lib/logger.js";
import { CC_MAX_RETRIES, CC_RETRY_BACKOFF_MS, CC_FULL_SCAN_DAYS } from "../lib/config.js";
import { ProbeCache } from "../lib/probe-cache.js";
import type { CrystalCommerceStoreConfig } from "./stores.config.js";

const log = logger.child({ component: "crystalcommerce" });

// Cache of category IDs that actually had stock, so daily runs skip the empty ones.
const _dir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = join(_dir, "../../data");
const cacheFile = (storeId: string) =>
  join(process.env.SCRAPER_CACHE_DIR ?? DEFAULT_CACHE_DIR, `crystalcommerce-${storeId}-categories.json`);

// ── Title suffix vocabulary ───────────────────────────────────────────────────
// Trailing " - X" segments are only stripped when X is one of these. Anything
// else is left in the card name ("Helm's Deep - Shinka, the Bloodsoaked Keep").
//
// Special foils (Textured, Ripple, Raised, …) set finish only. They usually sit
// on a borderless or showcase printing, but "usually" isn't good enough to
// assert a treatment the matcher will then filter on.

type TitleSuffix = { finish?: "foil" | "etched"; treatment?: string };

const TITLE_SUFFIXES: Record<string, TitleSuffix> = {
  "foil": { finish: "foil" },
  "foil etched": { finish: "etched" },
  "etched foil": { finish: "etched" },
  "textured foil": { finish: "foil" },
  "ripple foil": { finish: "foil" },
  "surge foil": { finish: "foil" },
  "galaxy foil": { finish: "foil" },
  "gilded foil": { finish: "foil" },
  "raised foil": { finish: "foil" },
  "halo foil": { finish: "foil" },
  "confetti foil": { finish: "foil" },
  "rainbow foil": { finish: "foil" },
  "oil slick raised foil": { finish: "foil" },
  "step-and-compleat foil": { finish: "foil" },
  "borderless": { treatment: "borderless" },
  "extended art": { treatment: "extendedart" },
  "showcase": { treatment: "showcase" },
  "full art": { treatment: "fullart" },
  "fullart": { treatment: "fullart" },
};

// Zero-padded collector number some titles carry, e.g. "Kaalia of the Vast (0343)".
const COLLECTOR_NUM_RE = /\s*\((\d{3,4})\)\s*$/;

export interface ParsedTitle {
  cardName: string;
  collectorNumber: string | null;
  finish: "nonfoil" | "foil" | "etched";
  treatment: string | undefined;
}

/**
 * "Genku, Future Shaper - Foil - Borderless"
 *   → { cardName: "Genku, Future Shaper", finish: "foil", treatment: "borderless" }
 */
export function parseProductTitle(title: string): ParsedTitle {
  const parts = title.split(" - ").map((p) => p.trim());

  let finish: "nonfoil" | "foil" | "etched" = "nonfoil";
  let treatment: string | undefined;

  // Peel known suffixes off the end; stop at the first unrecognised one so that
  // card names containing " - " survive intact.
  while (parts.length > 1) {
    const suffix = TITLE_SUFFIXES[parts[parts.length - 1].toLowerCase()];
    if (!suffix) break;
    if (suffix.finish) finish = suffix.finish;
    if (suffix.treatment) treatment = suffix.treatment;
    parts.pop();
  }

  let cardName = parts.join(" - ").trim();

  let collectorNumber: string | null = null;
  const collectorMatch = COLLECTOR_NUM_RE.exec(cardName);
  if (collectorMatch) {
    collectorNumber = String(parseInt(collectorMatch[1], 10));
    cardName = cardName.slice(0, collectorMatch.index).trim();
  }

  return { cardName, collectorNumber, finish, treatment };
}

/**
 * Variant descriptions read "NM-Mint, English" or "Light Play, Japanese".
 * Returns null for languages we can't represent as a printing.
 */
export function parseVariantDescription(desc: string): { condition: string; language: string } | null {
  const parts = desc.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const condition = normaliseCondition(parts[0]);
  const language = parts.length > 1 ? parts[parts.length - 1] : "English";
  if (language.toLowerCase() !== "english") return null;

  return { condition, language };
}

/** "AUD$ 1,760.00" → "1760.00". Returns null if no number is present. */
export function parsePrice(raw: string): string | null {
  const match = /([\d,]+\.\d{2})/.exec(raw);
  if (!match) return null;
  return match[1].replace(/,/g, "");
}

export interface CategoryLink {
  slug: string;
  id: string;
}

/**
 * Pull every MTG singles category out of the nav mega-menu.
 * Skips the category root itself and art-card categories (not real printings).
 */
export function parseCategoryLinks(html: string, categoryPrefix: string): CategoryLink[] {
  const seen = new Set<string>();
  const links: CategoryLink[] = [];
  const pattern = new RegExp(`/catalog/(${categoryPrefix}[a-z0-9_-]*)/(\\d+)`, "g");

  for (const match of html.matchAll(pattern)) {
    const [, slug, id] = match;
    if (seen.has(id)) continue;
    if (!slug.startsWith(`${categoryPrefix}-`)) continue; // root / sibling like "magic_singles_12"
    if (slug.includes("art_cards")) continue;
    seen.add(id);
    links.push({ slug, id });
  }
  return links;
}

/** Parse one category page into ScrapedCards. */
export function parseCategoryPage(html: string, baseUrl: string, fallbackSetName: string): ScrapedCard[] {
  const $ = cheerio.load(html);
  const cards: ScrapedCard[] = [];

  $("li.product").each((_, el) => {
    const $product = $(el);
    // Read the heading's text, not its title attribute: CrystalCommerce emits
    // unescaped quotes into the attribute, so `Kongming, "Sleeping Dragon"`
    // truncates to `Kongming, `. The text content is intact.
    const $name = $product.find("h4.name").first();
    const title = ($name.text().trim() || $name.attr("title")?.trim()) ?? "";
    if (!title) return;

    const href = $product.find("div.image a, div.meta a").first().attr("href");
    const sourceUrl = href ? new URL(href, baseUrl).toString() : baseUrl;

    const { cardName, collectorNumber, finish, treatment } = parseProductTitle(title);

    // The detail-layout block is the only one listing every variant; the grid
    // and list blocks show just the priciest in-stock one.
    $product.find("div.variants div.variant-row").each((__, variantEl) => {
      const $variant = $(variantEl);
      if ($variant.hasClass("no-stock")) return;

      const desc = $variant.find(".variant-description").first().text().trim();
      const parsed = parseVariantDescription(desc);
      if (!parsed) return;

      const $form = $variant.find("form.add-to-cart-form").first();
      const price = parsePrice($form.attr("data-price") ?? $variant.find(".price").first().text());
      if (!price) return;

      cards.push({
        rawName: cardName,
        setCode: null,
        setName: $form.attr("data-category")?.trim() || fallbackSetName,
        collectorNumber,
        price,
        priceType: "sell",
        condition: parsed.condition,
        isFoil: finish !== "nonfoil",
        finish,
        treatment,
        inStock: true, // in-stock filter is applied server-side
        sourceUrl,
      });
    });
  });

  return cards;
}

/** True when the pagination block offers a next page. */
export function hasNextPage(html: string): boolean {
  return /class="next_page"/.test(html);
}

/** "magic_singles-standard-bloomburrow_variants" → "Bloomburrow Variants" */
export function setNameFromSlug(slug: string): string {
  const leaf = slug.split("-").pop() ?? slug;
  return leaf
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export class CrystalCommerceScraper extends BaseScraper {
  constructor(private readonly config: CrystalCommerceStoreConfig) {
    super();
  }

  // CrystalCommerce drops connections under sustained load, so retry with
  // backoff before giving up on a page.
  private async fetchWithRetry(url: string): Promise<string | null> {
    for (let attempt = 0; attempt <= CC_MAX_RETRIES; attempt++) {
      try {
        return await this.fetchHtml(url);
      } catch (err) {
        const isLast = attempt === CC_MAX_RETRIES;
        const is404 = err instanceof Error && err.message.includes("HTTP 404");
        if (is404 || isLast) {
          log.warn({ store: this.config.id, url, attempt, err: String(err) }, "Giving up on page");
          return null;
        }
        await new Promise((r) => setTimeout(r, CC_RETRY_BACKOFF_MS[attempt]));
      }
    }
    return null;
  }

  private categoryUrl(category: CategoryLink, page: number): string {
    const params = new URLSearchParams({
      filtered: "1",
      filter_by_stock: "in-stock",
      page: String(page),
    });
    return `${this.config.baseUrl}/catalog/${category.slug}/${category.id}?${params}`;
  }

  async *scrapeAll(): AsyncGenerator<ScrapedCard> {
    log.info({ store: this.config.id }, "Fetching CrystalCommerce category list");
    const homeHtml = await this.fetchWithRetry(this.config.baseUrl);
    if (!homeHtml) {
      log.error({ store: this.config.id }, "Could not load homepage — no categories to scrape");
      return;
    }

    const categories = parseCategoryLinks(homeHtml, this.config.categoryPrefix);
    if (categories.length === 0) {
      log.warn({ store: this.config.id, prefix: this.config.categoryPrefix }, "No categories found on homepage");
      return;
    }

    // Same ProbeCache pattern MTG Mate uses: after a full scan, daily runs only
    // revisit the categories that had stock. The difference from MTG Mate is
    // that an empty category here is transient (sold out), not a permanent 404 —
    // so the weekly full scan is what brings a restocked category back.
    const cache = new ProbeCache({
      filePath: cacheFile(this.config.id),
      fullScanIntervalDays: CC_FULL_SCAN_DAYS,
    });
    await cache.load();

    const isFullScan = cache.needsFullScan();
    const cachedIds = new Set(cache.getValidKeys());
    let toScrape = isFullScan ? categories : categories.filter((c) => cachedIds.has(c.id));

    // Category IDs renumbered under us — the cache is useless, rescan everything.
    if (!isFullScan && toScrape.length === 0) {
      log.warn({ store: this.config.id }, "Cached categories match none on the site — falling back to a full scan");
      toScrape = categories;
    }

    log.info(
      { store: this.config.id, total: categories.length, scraping: toScrape.length, isFullScan },
      "CrystalCommerce scrape plan",
    );

    let pagesFetched = 0;
    let yielded = 0;
    const productiveIds: string[] = [];

    for (const [index, category] of toScrape.entries()) {
      const fallbackSetName = setNameFromSlug(category.slug);
      let categoryCards = 0;

      // A ~700-request run is long enough that silence is indistinguishable
      // from a stall — log progress at info level periodically.
      if (index > 0 && index % 50 === 0) {
        log.info(
          { store: this.config.id, done: index, total: toScrape.length, pages: pagesFetched, cards: yielded },
          "CrystalCommerce progress",
        );
      }

      for (let page = 1; page <= this.config.maxPagesPerCategory; page++) {
        const html = await this.fetchWithRetry(this.categoryUrl(category, page));
        if (!html) break;
        pagesFetched++;

        const cards = parseCategoryPage(html, this.config.baseUrl, fallbackSetName);
        for (const card of cards) {
          categoryCards++;
          yielded++;
          yield card;
        }

        if (cards.length === 0 || !hasNextPage(html)) break;
      }

      if (categoryCards > 0) productiveIds.push(category.id);
      log.debug({ store: this.config.id, category: category.slug, cards: categoryCards, yielded }, "Category done");
    }

    if (isFullScan) {
      await cache.save(productiveIds);
      log.info({ store: this.config.id, categories_cached: productiveIds.length }, "CrystalCommerce category cache updated");
    }

    log.info(
      { store: this.config.id, categories: toScrape.length, pages: pagesFetched, cards: yielded, isFullScan },
      "CrystalCommerce scrape complete",
    );
  }
}
