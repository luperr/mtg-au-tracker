/**
 * MTG Mate scraper — https://www.mtgmate.com.au
 *
 * MTG Mate is a custom Rails + React app.
 *
 * Strategy:
 *   1. Fetch /magic_sets — set codes are embedded as "magic_sets/{code}" paths in the
 *      page HTML (JS bundles + data attrs). Extract via regex (~697 codes).
 *   2. For each set code, probe /magic_sets/{code}/data directly — no need to load the
 *      set HTML page first (Option A). 404 → set doesn't exist on MTG Mate, skip.
 *   3. Parse card entries from uuid_data and yield as ScrapedCard.
 *
 * Concurrency (Option B):
 *   Set codes are processed in parallel batches of CONCURRENCY (default 3). This
 *   gives ~3× throughput vs sequential without hammering the server.
 *
 * Set code cache (Option E):
 *   After the first successful run, ProbeCache persists which set codes returned data.
 *   Daily runs probe only those ~100 codes instead of all ~697 (~2–4 min vs ~30 min).
 *   A full rescan runs every MTGMATE_FULL_SCAN_DAYS (default: 7) to pick up new sets.
 *   Cache file: SCRAPER_CACHE_DIR/mtgmate-valid-sets.json
 *
 * Data notes:
 *   - price is in cents (integer): 800 = $8.00 AUD
 *   - set_code is already Scryfall lowercase format: "dmu", "m11", etc.
 *   - finish: "Foil" | "Nonfoil"
 *   - condition: "Regular" = NM
 *   - quantity: 0 = out of stock
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { ScrapedCard } from "@mtg-au/shared";
import { BaseScraper } from "./base-scraper.js";
import { logger } from "../lib/logger.js";
import { ProbeCache } from "../lib/probe-cache.js";

const log = logger.child({ component: "mtgmate" });

const BASE_URL = "https://www.mtgmate.com.au";

// Number of set data URLs fetched in parallel.
// Each slot opens its own browser page; 3 is a safe balance vs server load.
const CONCURRENCY = 3;

// Cache for known-good set codes. Avoids probing ~697 codes daily when only ~100 have data.
const _dir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = join(_dir, "../../data");
const CACHE_FILE = join(process.env.SCRAPER_CACHE_DIR ?? DEFAULT_CACHE_DIR, "mtgmate-valid-sets.json");
const FULL_SCAN_DAYS = Number(process.env.MTGMATE_FULL_SCAN_DAYS ?? 7);

interface MtgMateCardEntry {
  uuid: string;
  name: string;
  price: number;     // cents
  set_name: string;
  set_code: string;  // Scryfall lowercase format
  rarity: string;
  quantity: number;
  finish: string;    // "Foil" | "Nonfoil"
  condition: string; // "Regular" = NM
  link_path: string; // e.g. "/cards/Lightning_Bolt/M11/149"
}

interface CardDataResponse {
  uuid_data: Record<string, MtgMateCardEntry>;
}

function normaliseCondition(raw: string): string {
  switch (raw.toLowerCase()) {
    case "regular":           return "NM";
    case "lightly played":    return "LP";
    case "moderately played": return "MP";
    case "heavily played":    return "HP";
    case "damaged":           return "DMG";
    default:                  return raw;
  }
}

// Extract unique set codes from the /magic_sets listing page.
// Codes are embedded as "magic_sets/{code}" paths in JS bundles and data attrs —
// not as <a> links — so we use regex rather than Cheerio.
function parseSetCodes(html: string): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const match of html.matchAll(/magic_sets\/([a-z0-9]+)/g)) {
    const code = match[1];
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return codes;
}

// Extract collector number from link_path: "/cards/Lightning_Bolt/M11/149" → "149"
// Strips ":foil" suffix that MTG Mate appends to foil link_paths: "305:foil" → "305"
function parseCollectorNumber(linkPath: string): string | null {
  const parts = linkPath.split("/");
  const last = parts[parts.length - 1];
  const num = last?.split(":")[0];
  return num && num.length > 0 ? num : null;
}

function mapEntry(entry: MtgMateCardEntry): ScrapedCard {
  return {
    rawName: entry.name,
    setCode: entry.set_code || null,
    setName: entry.set_name || null,
    collectorNumber: parseCollectorNumber(entry.link_path),
    price: (entry.price / 100).toFixed(2),
    priceType: "sell",
    condition: normaliseCondition(entry.condition),
    isFoil: entry.finish === "Foil",
    inStock: entry.quantity > 0,
    sourceUrl: `${BASE_URL}${entry.link_path}`,
  };
}

export class MtgMateScraper extends BaseScraper {
  getBaseUrl(): string {
    return BASE_URL;
  }

  // Fetch card data for one set code. Returns entries (may be empty).
  // Silently returns [] on 404 (set doesn't exist on MTG Mate).
  // Logs a warning on unexpected errors.
  private async fetchSetData(code: string): Promise<MtgMateCardEntry[]> {
    const url = `${BASE_URL}/magic_sets/${code}/data`;
    try {
      const data = await this.fetchJson<CardDataResponse>(url);
      if (!data.uuid_data) return [];
      return Object.values(data.uuid_data);
    } catch (err: unknown) {
      // 404 = this set code doesn't exist on MTG Mate — expected for many codes
      const is404 = err instanceof Error && err.message.includes("HTTP 404");
      if (!is404) {
        log.warn({ url, err: String(err) }, "Failed to fetch set data");
      }
      return [];
    }
  }

  async *scrapeAll(): AsyncGenerator<ScrapedCard> {
    log.info("Fetching MTG Mate set list");
    const setsHtml = await this.fetchPage(`${BASE_URL}/magic_sets`);
    const allCodes = parseSetCodes(setsHtml);

    if (allCodes.length === 0) {
      log.warn("No set codes found on /magic_sets");
      return;
    }

    const cache = new ProbeCache({ filePath: CACHE_FILE, fullScanIntervalDays: FULL_SCAN_DAYS });
    await cache.load();

    const isFullScan = cache.needsFullScan();
    const codes = isFullScan ? allCodes : cache.getValidKeys();

    log.info(
      { total: allCodes.length, probing: codes.length, concurrency: CONCURRENCY, isFullScan },
      "MTG Mate probe plan"
    );

    let scraped = 0;
    let withData = 0;
    const validCodes: string[] = [];

    // Process set codes in parallel batches
    for (let i = 0; i < codes.length; i += CONCURRENCY) {
      const batch = codes.slice(i, i + CONCURRENCY);

      const results = await Promise.all(batch.map((code) => this.fetchSetData(code)));

      for (let j = 0; j < batch.length; j++) {
        const entries = results[j];
        scraped++;
        if (entries.length > 0) {
          withData++;
          validCodes.push(batch[j]);
          log.debug({ set_code: batch[j], card_count: entries.length, scraped, total: codes.length }, "Set data fetched");
          for (const entry of entries) {
            yield mapEntry(entry);
          }
        }
      }
    }

    if (isFullScan) {
      await cache.save(validCodes);
      log.info({ valid_codes_cached: validCodes.length }, "MTG Mate set code cache updated");
    }

    log.info({ sets_with_data: withData, sets_probed: codes.length, isFullScan }, "MTG Mate scrape complete");
  }
}
