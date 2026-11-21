/**
 * Cardtastic scraper — https://www.cardtastic.com.au
 *
 * Cardtastic is a bespoke ASP.NET WebForms store with no products API, so this
 * is HTML scraping of its category pages.
 *
 * Strategy:
 *   1. Fetch the MTG singles category (category-single-cards-15.aspx). It holds
 *      no products itself — it's a grid of one subcategory per set (~186).
 *   2. Page through each set with ?page=N, 24 products per page. The page
 *      carries the set's total product count (lblRecCount), so the page count
 *      is known after the first request. ~28.6k products, ~1,290 pages.
 *
 * Data notes:
 *   - Titles are the bare card name — no set, collector number, finish or
 *     treatment. Set comes from the category; the matcher's setNameIndex
 *     resolves it ("Duskmourn: House of Horror", "Revised").
 *   - Each product has "Regular" / "Foil" options, but the listing shows only
 *     the Regular price — even where the product page defaults to Foil. The
 *     foil price is reachable only via a WebForms postback per product, so
 *     every listing is scraped as non-foil.
 *   - Alternate arts are separate products with the same title in the same
 *     set, indistinguishable short of the image. They match by name + set.
 *   - No condition anywhere; singles are sold as NM.
 *   - Sold-out products show a "SOLD OUT" banner in place of Add to Cart.
 */

import * as cheerio from "cheerio";
import type { ScrapedCard } from "@mtg-au/shared";
import { BaseScraper } from "./base-scraper.js";
import { logger } from "../lib/logger.js";
import { CARDTASTIC_BASE_URL } from "../lib/config.js";

const log = logger.child({ component: "cardtastic" });

const SINGLES_CATEGORY = "category-single-cards-15.aspx";
const PAGE_SIZE = 24;
// Loop guard. The largest set is ~460 products (20 pages); a higher count means
// lblRecCount has been misread.
const MAX_PAGES_PER_SET = 60;

export interface SetCategory {
  path: string; // "category-bloomburrow-1151.aspx"
  name: string; // "Bloomburrow"
}

/**
 * The per-set subcategory tiles on the singles category page. Breadcrumb links
 * (Card Games » Magic the Gathering) sit outside the tile grid and are skipped.
 */
export function parseSetCategories(html: string): SetCategory[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const sets: SetCategory[] = [];

  $(".product-desc-sh h4 a[href^='category-']").each((_, el) => {
    const path = $(el).attr("href") ?? "";
    const name = $(el).text().trim();
    if (!name || seen.has(path)) return;
    seen.add(path);
    sets.push({ path, name });
  });

  return sets;
}

/** Total products in the category, from the hidden lblRecCount field. */
export function parseRecordCount(html: string): number {
  const match = /id="ctl00_ctPublic_lblRecCount" value="(\d+)"/.exec(html);
  return match ? parseInt(match[1], 10) : 0;
}

/** "$1,299.00" → "1299.00". Returns null if no price is present. */
export function parsePrice(raw: string): string | null {
  const match = /\$\s*([\d,]+\.\d{2})/.exec(raw);
  return match ? match[1].replace(/,/g, "") : null;
}

/** Parse one category page's product tiles into ScrapedCards. */
export function parseProductPage(html: string, setName: string): ScrapedCard[] {
  const $ = cheerio.load(html);
  const cards: ScrapedCard[] = [];

  $(".product-desc-sh").each((_, el) => {
    const $tile = $(el);
    const $link = $tile.find("h4 a[href^='product-']").first();
    const href = $link.attr("href");
    const name = $link.text().trim();
    if (!href || !name) return;

    // The price span is the h4's next sibling; later spans belong to buttons.
    const price = parsePrice($tile.children("span").first().text());
    if (!price) return;

    cards.push({
      rawName: name,
      setCode: null,
      setName,
      collectorNumber: null,
      price,
      priceType: "sell",
      condition: "NM",
      isFoil: false,
      finish: "nonfoil",
      inStock: !/SOLD OUT/i.test($tile.text()),
      sourceUrl: `${CARDTASTIC_BASE_URL}/${href}`,
    });
  });

  return cards;
}

export class CardtasticScraper extends BaseScraper {
  private async scrapeSet(set: SetCategory): Promise<{ cards: ScrapedCard[]; pages: number; failed: boolean }> {
    const cards: ScrapedCard[] = [];
    let pageCount = 1;
    let pages = 0;

    for (let page = 1; page <= pageCount; page++) {
      const url = `${CARDTASTIC_BASE_URL}/${set.path}${page > 1 ? `?page=${page}` : ""}`;
      let html: string;
      try {
        html = await this.fetchHtml(url);
      } catch (err) {
        log.warn({ url, err: String(err) }, "Giving up on page — rest of set skipped");
        return { cards, pages, failed: true };
      }
      pages++;

      if (page === 1) {
        pageCount = Math.ceil(parseRecordCount(html) / PAGE_SIZE);
        if (pageCount > MAX_PAGES_PER_SET) {
          log.warn({ set: set.name, pageCount, max_pages: MAX_PAGES_PER_SET }, "Set exceeds page cap — listings are being dropped");
          pageCount = MAX_PAGES_PER_SET;
        }
      }

      const pageCards = parseProductPage(html, set.name);
      cards.push(...pageCards);
      if (pageCards.length === 0) break;
    }

    return { cards, pages, failed: false };
  }

  async *scrapeAll(): AsyncGenerator<ScrapedCard> {
    log.info("Fetching Cardtastic set list");
    const sets = parseSetCategories(await this.fetchHtml(`${CARDTASTIC_BASE_URL}/${SINGLES_CATEGORY}`));
    if (sets.length === 0) {
      log.warn("No set categories found on the singles page");
      return;
    }
    log.info({ sets: sets.length }, "Cardtastic scrape plan");

    const startedAt = Date.now();
    let pagesFetched = 0;
    let yielded = 0;
    let failedSets = 0;

    // Sequential: ~1,290 pages at BaseScraper's 500ms pacing is ~20 minutes.
    for (const [i, set] of sets.entries()) {
      const result = await this.scrapeSet(set);
      pagesFetched += result.pages;
      if (result.failed) failedSets++;

      for (const card of result.cards) {
        yielded++;
        yield card;
      }

      if ((i + 1) % 50 === 0) {
        log.info(
          { done: i + 1, total: sets.length, pages: pagesFetched, cards: yielded, failed_sets: failedSets },
          "Cardtastic progress",
        );
      }
    }

    log.info(
      {
        sets: sets.length,
        pages: pagesFetched,
        cards: yielded,
        failed_sets: failedSets,
        elapsed_min: +((Date.now() - startedAt) / 60_000).toFixed(1),
      },
      "Cardtastic scrape complete",
    );
  }
}
