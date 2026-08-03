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
 *      The in-stock filter matters — out-of-stock listings have no price we'd
 *      keep, and dropping them roughly halves the pages.
 *
 *      It's still a big job: ~30 products/page is a hard cap (per_page and
 *      limit are ignored) and the Games Cube stocks ~93k listings, so a sweep
 *      is ~3,500 pages at ~2.3s of server TTFB each — hence CC_CONCURRENCY
 *      categories in flight at once (measured 88 min at 3). There is no bulk
 *      alternative: .json/.xml on catalog routes 415, /products.json 404s, and
 *      /products/multi_search returns out-of-stock printings too (3MB for 5
 *      card names), so it's heavier than browsing.
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
import { type ScrapedCard, normaliseCondition, isKnownCondition } from "@mtg-au/shared";
import { BaseScraper } from "./base-scraper.js";
import { logger } from "../lib/logger.js";
import { CC_MAX_RETRIES, CC_RETRY_BACKOFF_MS, CC_FULL_SCAN_DAYS, CC_CONCURRENCY } from "../lib/config.js";
import { ProbeCache } from "../lib/probe-cache.js";
import { mapConcurrentStream } from "../lib/utils.js";
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

  // normaliseCondition echoes anything it doesn't recognise, so this has to be
  // checked rather than trusted: the variants block also carries rows that
  // aren't conditions at all (CrystalCommerce's aggregate "All variants"), and
  // those would otherwise land in store_prices.condition and pollute the UI's
  // condition filter.
  const condition = normaliseCondition(parts[0]);
  if (!isKnownCondition(condition)) return null;

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
 * Pull every MTG singles *leaf* category out of the nav mega-menu.
 *
 * Skips the category root, art-card categories (not real printings), and
 * intermediate nav nodes. That last one matters: the mega-menu links its
 * grouping levels too ("magic_singles-standard" alongside
 * "magic_singles-standard-bloomburrow"), and an intermediate node lists every
 * product belonging to all of its children. Scraping one is both enormous —
 * it blows straight through maxPagesPerCategory — and duplicative, since every
 * listing under it is also reached via its own leaf category.
 *
 * A node is intermediate when its slug is a strict prefix of another category's
 * slug at a "-" boundary.
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

  const slugs = links.map((l) => l.slug);
  return links.filter((link) => !slugs.some((other) => other.startsWith(`${link.slug}-`)));
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

interface CategoryResult {
  categoryId: string;
  cards: ScrapedCard[];
  pages: number;
  /** A page in this category exhausted its retries — the result is incomplete. */
  failed: boolean;
}

export class CrystalCommerceScraper extends BaseScraper {
  /** Retried requests this run — a silent throughput killer, so it's reported. */
  private retries = 0;

  constructor(private readonly config: CrystalCommerceStoreConfig) {
    super();
  }

  // CrystalCommerce drops connections under sustained load, so retry with
  // backoff before giving up on a page.
  //
  // Retries are counted and surfaced in the progress log, not just logged when
  // they run out: a run was observed degrading ~25x in its tail (33s/page vs
  // 1.3s) purely from pages timing out and then succeeding on retry. Nothing
  // failed, so nothing was logged, and three hours vanished silently.
  private async fetchWithRetry(url: string): Promise<string | null> {
    for (let attempt = 0; attempt <= CC_MAX_RETRIES; attempt++) {
      try {
        const html = await this.fetchHtml(url);
        if (attempt > 0) this.retries += attempt;
        return html;
      } catch (err) {
        const isLast = attempt === CC_MAX_RETRIES;
        const is404 = err instanceof Error && err.message.includes("HTTP 404");
        if (is404 || isLast) {
          this.retries += attempt;
          log.warn({ store: this.config.id, url, attempt, err: String(err) }, "Giving up on page");
          return null;
        }
        log.debug({ store: this.config.id, url, attempt, err: String(err) }, "Retrying page");
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

  /**
   * Page through one category and return everything in stock.
   *
   * Collects rather than yields so several categories can be in flight at once;
   * one category is a few hundred cards at most.
   */
  private async scrapeCategory(category: CategoryLink): Promise<CategoryResult> {
    const fallbackSetName = setNameFromSlug(category.slug);
    const cards: ScrapedCard[] = [];
    let pages = 0;
    let failed = false;
    let truncated = false;

    for (let page = 1; page <= this.config.maxPagesPerCategory; page++) {
      const html = await this.fetchWithRetry(this.categoryUrl(category, page));
      if (!html) {
        failed = true;
        break;
      }
      pages++;

      const pageCards = parseCategoryPage(html, this.config.baseUrl, fallbackSetName);
      cards.push(...pageCards);

      if (pageCards.length === 0 || !hasNextPage(html)) break;
      // Loop guard reached with more pages still on offer. Silently stopping
      // here makes a truncated category indistinguishable from a complete one,
      // so say so — it means either a genuinely huge category or that
      // next-page detection has broken.
      if (page === this.config.maxPagesPerCategory) {
        truncated = true;
        log.warn(
          { store: this.config.id, category: category.slug, max_pages: this.config.maxPagesPerCategory },
          "Category hit the page cap with more pages available — listings are being dropped",
        );
      }
    }

    log.debug(
      { store: this.config.id, category: category.slug, cards: cards.length, pages, failed, truncated },
      "Category done",
    );
    return { categoryId: category.id, cards, pages, failed };
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

    const cachedIds = new Set(cache.getValidKeys());
    let isFullScan = cache.needsFullScan();
    let toScrape = isFullScan ? categories : categories.filter((c) => cachedIds.has(c.id));

    // Category IDs renumbered under us — the cache is useless, rescan
    // everything. This is a full scan in every sense, so it must be flagged as
    // one: otherwise the rebuilt cache is never written and every subsequent
    // daily run repeats the same ~3,500-page sweep until the interval expires.
    if (!isFullScan && toScrape.length === 0) {
      log.warn({ store: this.config.id }, "Cached categories match none on the site — falling back to a full scan");
      toScrape = categories;
      isFullScan = true;
    }

    log.info(
      { store: this.config.id, total: categories.length, scraping: toScrape.length, isFullScan },
      "CrystalCommerce scrape plan",
    );

    const startedAt = Date.now();
    let pagesFetched = 0;
    let yielded = 0;
    let done = 0;
    let failedCategories = 0;
    const keepIds: string[] = [];

    // Concurrency is across categories rather than pages within one, because a
    // category's page count isn't known until its pages have been fetched.
    //
    // Streamed rather than batched: category page counts vary from 1 to 25, so
    // awaiting fixed chunks would run each chunk at the speed of its slowest
    // member. mapConcurrentStream keeps CC_CONCURRENCY requests in flight
    // throughout while still bounding how many categories' cards are buffered —
    // the full catalogue is ~90k listings.
    const results = mapConcurrentStream(toScrape, CC_CONCURRENCY, (category) =>
      this.scrapeCategory(category),
    );

    for await (const result of results) {
      pagesFetched += result.pages;
      done++;

      // What goes back in the cache: categories that had stock, plus any whose
      // pages ran out of retries. A failed category isn't known to be empty,
      // and pruning it would drop a whole set from prices until the next full
      // scan — on a store documented to stall under sustained load, that would
      // be a routine occurrence rather than an edge case.
      if (result.failed) failedCategories++;
      if (result.cards.length > 0 || result.failed) keepIds.push(result.categoryId);

      for (const card of result.cards) {
        yielded++;
        yield card;
      }

      // A ~3800-page run is long enough that silence is indistinguishable from
      // a stall — log progress at info level periodically.
      if (done % 50 === 0) {
        const elapsedMin = (Date.now() - startedAt) / 60_000;
        log.info(
          {
            store: this.config.id,
            done,
            total: toScrape.length,
            pages: pagesFetched,
            cards: yielded,
            retries: this.retries,
            failed_categories: failedCategories,
            elapsed_min: +elapsedMin.toFixed(1),
            // The number to watch: it held ~1.3s in a healthy run and blew out
            // to ~33s when the store started stalling.
            secs_per_page: pagesFetched > 0 ? +((elapsedMin * 60) / pagesFetched).toFixed(2) : 0,
          },
          "CrystalCommerce progress",
        );
      }
    }

    if (isFullScan) {
      await cache.save(keepIds);
      log.info(
        { store: this.config.id, categories_cached: keepIds.length, failed_categories: failedCategories },
        "CrystalCommerce category cache updated",
      );
    }

    const elapsedMin = (Date.now() - startedAt) / 60_000;
    log.info(
      {
        store: this.config.id,
        categories: toScrape.length,
        pages: pagesFetched,
        cards: yielded,
        retries: this.retries,
        failed_categories: failedCategories,
        elapsed_min: +elapsedMin.toFixed(1),
        secs_per_page: pagesFetched > 0 ? +((elapsedMin * 60) / pagesFetched).toFixed(2) : 0,
        isFullScan,
      },
      "CrystalCommerce scrape complete",
    );
  }
}
