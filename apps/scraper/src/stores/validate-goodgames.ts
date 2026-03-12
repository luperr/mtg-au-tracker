/**
 * Validation tool for the Good Games scraper + card matcher.
 *
 * Fetches N pages of Good Games products, runs each ScrapedCard through the
 * CardMatcher, then reports matches grouped by quality so you can manually
 * review low-confidence and borderless matches.
 *
 * Usage:
 *   docker compose run --rm dev pnpm --filter @mtg-au/scraper validate:goodgames
 *   docker compose run --rm dev pnpm --filter @mtg-au/scraper validate:goodgames 5
 *
 * The optional numeric argument controls how many Shopify pages to scan
 * (default: 3, each page = 250 products). Set to 0 to scan all pages.
 *
 * Output sections:
 *   BORDERLESS   — borderless cards with the matched Scryfall URI for visual check
 *   LOW CONF     — matches with confidence < 0.7 (likely wrong)
 *   UNMATCHED    — cards the matcher couldn't resolve at all
 *   SUMMARY      — counts per match type and confidence tier
 */

import { GoodGamesScraper } from "./goodgames.js";
import { CardMatcher } from "../matching/card-matcher.js";
import type { ScrapedCard } from "@mtg-au/shared";
import type { MatchResult } from "../matching/card-matcher.js";
import { db, schema } from "../lib/db.js";
import { eq } from "drizzle-orm";

const MAX_PAGES = parseInt(process.argv[2] ?? "3", 10) || 3;
const ALL_PAGES = process.argv[2] === "0";
const LOW_CONF_THRESHOLD = 0.7;

interface ValidatedCard {
  card: ScrapedCard;
  result: MatchResult;
  scryfallUri?: string;
  collectorNumber?: string;
  setCode?: string;
}

async function lookupPrinting(printingId: string): Promise<{ scryfallUri: string; collectorNumber: string; setCode: string } | null> {
  const rows = await db
    .select({
      scryfallUri: schema.printings.scryfallUri,
      collectorNumber: schema.printings.collectorNumber,
      setCode: schema.printings.setCode,
    })
    .from(schema.printings)
    .where(eq(schema.printings.id, printingId))
    .limit(1);
  return rows[0] ?? null;
}

async function main() {
  console.log(`[validate] Building card matcher index...`);
  const matcher = new CardMatcher();
  await matcher.build();

  const scraper = new GoodGamesScraper();
  const results: ValidatedCard[] = [];
  let pageCount = 0;

  try {
    console.log(`[validate] Scraping Good Games (${ALL_PAGES ? "all" : MAX_PAGES} pages)...\n`);

    for await (const card of scraper.scrapeAll()) {
      const result = matcher.match(card);
      const validated: ValidatedCard = { card, result };
      results.push(validated);

      // Track page count via the scraper's console output (can't hook it directly,
      // so we just count cards — 250 products × ~2 variants avg ≈ 500 cards/page)
      pageCount = Math.ceil(results.length / 500);
      if (!ALL_PAGES && pageCount >= MAX_PAGES + 1) break;
    }
  } finally {
    await scraper.close();
  }

  console.log(`[validate] Scraped ${results.length} card entries. Resolving printing details...\n`);

  // Look up Scryfall URIs for borderless and low-confidence matches
  const needsLookup = results.filter(
    (r) => r.result.printingId && (r.card.isBorderless || r.result.confidence < LOW_CONF_THRESHOLD),
  );
  for (const r of needsLookup) {
    if (!r.result.printingId) continue;
    const printing = await lookupPrinting(r.result.printingId);
    if (printing) {
      r.scryfallUri = printing.scryfallUri;
      r.collectorNumber = printing.collectorNumber;
      r.setCode = printing.setCode;
    }
  }

  // ── Borderless matches ────────────────────────────────────────────────────
  const borderless = results.filter((r) => r.card.isBorderless);
  if (borderless.length > 0) {
    console.log(`\n${"═".repeat(80)}`);
    console.log(`BORDERLESS MATCHES (${borderless.length}) — verify Scryfall URI shows borderless art`);
    console.log(`${"═".repeat(80)}`);
    for (const r of borderless) {
      const conf = r.result.confidence.toFixed(2);
      const matched = r.result.printingId
        ? `→ ${r.setCode}#${r.collectorNumber}  conf=${conf}  ${r.scryfallUri ?? "(no uri)"}`
        : `→ UNMATCHED`;
      console.log(`  ${String(r.card.rawName).padEnd(45)}  [${r.card.setName ?? "?"}]`);
      console.log(`    ${matched}`);
    }
  }

  // ── Low confidence matches ────────────────────────────────────────────────
  const lowConf = results.filter(
    (r) => r.result.printingId && r.result.confidence < LOW_CONF_THRESHOLD && !r.card.isBorderless,
  );
  if (lowConf.length > 0) {
    console.log(`\n${"═".repeat(80)}`);
    console.log(`LOW CONFIDENCE < ${LOW_CONF_THRESHOLD} (${lowConf.length})`);
    console.log(`${"═".repeat(80)}`);
    for (const r of lowConf) {
      const conf = r.result.confidence.toFixed(2);
      console.log(
        `  ${String(r.card.rawName).padEnd(45)}  [${r.card.setName ?? "?"}]  conf=${conf}  type=${r.result.matchType}`,
      );
      if (r.scryfallUri) console.log(`    → ${r.setCode}#${r.collectorNumber}  ${r.scryfallUri}`);
    }
  }

  // ── Unmatched cards ───────────────────────────────────────────────────────
  const unmatched = results.filter((r) => r.result.matchType === "unmatched");
  if (unmatched.length > 0) {
    // Deduplicate by name+set so repeated variants don't flood the output
    const seen = new Set<string>();
    const uniqueUnmatched = unmatched.filter((r) => {
      const key = `${r.card.rawName}|${r.card.setName ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`\n${"═".repeat(80)}`);
    console.log(`UNMATCHED (${unmatched.length} entries, ${uniqueUnmatched.length} unique names)`);
    console.log(`${"═".repeat(80)}`);
    for (const r of uniqueUnmatched) {
      console.log(
        `  ${String(r.card.rawName).padEnd(45)}  [${r.card.setName ?? "?"}]`,
      );
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const byType = new Map<string, number>();
  let highConf = 0;
  for (const r of results) {
    byType.set(r.result.matchType, (byType.get(r.result.matchType) ?? 0) + 1);
    if (r.result.confidence >= LOW_CONF_THRESHOLD) highConf++;
  }

  console.log(`\n${"═".repeat(80)}`);
  console.log(`SUMMARY — ${results.length} total card entries`);
  console.log(`${"═".repeat(80)}`);
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = ((count / results.length) * 100).toFixed(1);
    console.log(`  ${String(type).padEnd(14)} ${String(count).padStart(5)}  (${pct}%)`);
  }
  console.log(`  ${"─".repeat(30)}`);
  console.log(`  high conf ≥${LOW_CONF_THRESHOLD}  ${String(highConf).padStart(5)}  (${((highConf / results.length) * 100).toFixed(1)}%)`);
  console.log(`  borderless     ${String(borderless.length).padStart(5)}`);
  console.log(`  low conf       ${String(lowConf.length).padStart(5)}`);
  console.log(`  unmatched      ${String(unmatched.length).padStart(5)}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
