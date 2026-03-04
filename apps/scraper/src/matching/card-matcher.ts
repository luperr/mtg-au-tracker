import { db, schema } from "../lib/db.js";
import {
  normalizeName,
  levenshteinDistance,
  normalizeSetName,
  SET_ALIASES,
} from "@mtg-au/shared";
import type { ScrapedCard, MatchResult } from "@mtg-au/shared";
import { eq, and, sql } from "drizzle-orm";

/**
 * In-memory cache of normalised card names to printing IDs.
 * Built once at the start of a scrape run, then used for all matching.
 * This avoids hammering the DB with individual lookups.
 */
interface PrintingIndex {
  /** Map of "normalized_name:set_code" → printing ID */
  byNameAndSet: Map<string, string>;
  /** Map of "normalized_name" → most recent printing ID */
  byNameOnly: Map<string, string>;
  /** Array of all [normalized_name, printing_id] for fuzzy matching */
  allNames: Array<[string, string]>;
}

let cachedIndex: PrintingIndex | null = null;

/**
 * Build the in-memory index from the database.
 * Call this once before a scrape run.
 */
export async function buildPrintingIndex(): Promise<PrintingIndex> {
  console.log("Building printing index for card matching...");

  const allPrintings = await db
    .select({
      id: schema.printings.id,
      setCode: schema.printings.setCode,
      cardName: schema.cards.name,
      cardNameNormalized: schema.cards.nameNormalized,
    })
    .from(schema.printings)
    .innerJoin(schema.cards, eq(schema.printings.cardId, schema.cards.id));

  const byNameAndSet = new Map<string, string>();
  const byNameOnly = new Map<string, string>();
  const allNames: Array<[string, string]> = [];

  for (const p of allPrintings) {
    const normalName = p.cardNameNormalized;
    const key = `${normalName}:${p.setCode}`;

    byNameAndSet.set(key, p.id);

    // For name-only matching, keep the latest printing
    // (later entries in the array overwrite earlier ones, which is fine)
    byNameOnly.set(normalName, p.id);

    allNames.push([normalName, p.id]);
  }

  console.log(
    `Printing index built: ${byNameAndSet.size.toLocaleString()} name+set entries, ${byNameOnly.size.toLocaleString()} name entries`
  );

  cachedIndex = { byNameAndSet, byNameOnly, allNames };
  return cachedIndex;
}

/**
 * Attempt to resolve a set name string to a Scryfall set code.
 */
function resolveSetCode(setName: string | null): string | null {
  if (!setName) return null;

  const normalized = normalizeSetName(setName);

  // Check aliases first
  if (SET_ALIASES[normalized]) return SET_ALIASES[normalized];

  // If it looks like a set code already (2-5 lowercase chars), use it
  if (/^[a-z0-9]{2,5}$/.test(normalized)) return normalized;

  return null;
}

/**
 * Match a single scraped card to a printing in our database.
 */
export function matchCard(
  scrapedCard: ScrapedCard,
  index: PrintingIndex
): MatchResult {
  const normalName = normalizeName(scrapedCard.rawName);

  // 1. Exact match: name + set
  const setCode = resolveSetCode(scrapedCard.setName);
  if (setCode) {
    const key = `${normalName}:${setCode}`;
    const printingId = index.byNameAndSet.get(key);
    if (printingId) {
      return {
        scrapedCard,
        printingId,
        matchType: "exact",
        confidence: 1.0,
      };
    }
  }

  // 2. Name-only match
  const nameMatch = index.byNameOnly.get(normalName);
  if (nameMatch) {
    return {
      scrapedCard,
      printingId: nameMatch,
      matchType: "name_only",
      confidence: 0.8,
    };
  }

  // 3. Fuzzy match (Levenshtein distance ≤ 2)
  let bestDistance = Infinity;
  let bestMatch: string | null = null;

  for (const [candidateName, printingId] of index.allNames) {
    // Only fuzzy match names of similar length to avoid nonsense matches
    if (Math.abs(candidateName.length - normalName.length) > 3) continue;

    const distance = levenshteinDistance(normalName, candidateName);
    if (distance < bestDistance && distance <= 2) {
      bestDistance = distance;
      bestMatch = printingId;
    }
  }

  if (bestMatch) {
    return {
      scrapedCard,
      printingId: bestMatch,
      matchType: "fuzzy",
      confidence: 1 - bestDistance * 0.2,
    };
  }

  // 4. No match
  return {
    scrapedCard,
    printingId: null,
    matchType: "unmatched",
    confidence: 0,
  };
}
