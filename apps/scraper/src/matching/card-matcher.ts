/**
 * CardMatcher — matches scraped store listings to Scryfall printings in the DB.
 *
 * Strategy (in order of precision):
 *   0. Set+collector  — set code + collector number + foil          (confidence 1.0)
 *        The most precise match. (set_code, collector_number) is a unique key
 *        in Scryfall's data model, so this uniquely identifies the exact printing.
 *        Used when the store provides a collector number (e.g. MTG Mate via link_path).
 *
 *   1. Exact name    — normalised name + set code + foil            (confidence 1.0)
 *        Falls back to this when collector number is unavailable.
 *        Note: if a set has multiple printings of the same name (borderless, extended
 *        art, etc.) this will match the first one found — ambiguous.
 *
 *   2. Name+foil     — normalised name + foil flag, ignores set     (confidence 0.85 → 0.7)
 *   3. Name-only     — normalised name, ignores set and foil        (confidence 0.7  → 0.6)
 *   4. Fuzzy         — Levenshtein distance ≤ 2 on normalised name  (confidence 0.5+)
 *   5. Unmatched     — saved to unmatched_cards table for review
 *
 * Build the index once per scrape run (loads all printings from DB into memory),
 * then call match() for each scraped card — no further DB queries.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { normalizeName, stripVariant, levenshteinDistance } from "@mtg-au/shared";
import type { ScrapedCard } from "@mtg-au/shared";

export interface MatchResult {
  printingId: string | null;
  matchType: "set_collector" | "exact" | "name_foil" | "name_only" | "fuzzy" | "unmatched";
  confidence: number;
}

interface IndexEntry {
  printingId: string;
  setCode: string;
  collectorNumber: string;
  isFoil: boolean;
}

export class CardMatcher {
  // Primary index: "${setCode}:${collectorNumber}:${foil}" → printingId
  // Uniquely identifies a printing — O(1) lookup, no ambiguity.
  private setCollectorIndex = new Map<string, string>();

  // Fallback index: normalizedName → list of matching printings
  // Used when a store doesn't provide a collector number.
  private nameIndex = new Map<string, IndexEntry[]>();

  /**
   * Load all printings from the DB and build both lookup indexes.
   * Call once before running match() on any cards.
   */
  async build(): Promise<void> {
    const rows = await db
      .select({
        id: schema.printings.id,
        setCode: schema.printings.setCode,
        collectorNumber: schema.printings.collectorNumber,
        isFoil: schema.printings.isFoil,
        cardName: schema.cards.name,
      })
      .from(schema.printings)
      .innerJoin(schema.cards, eq(schema.printings.cardId, schema.cards.id));

    for (const row of rows) {
      // Primary: set + collector + foil → exact printing
      const setKey = `${row.setCode}:${row.collectorNumber}:${row.isFoil}`;
      this.setCollectorIndex.set(setKey, row.id);

      // Fallback: name → candidates
      const nameKey = normalizeName(row.cardName);
      const existing = this.nameIndex.get(nameKey) ?? [];
      existing.push({
        printingId: row.id,
        setCode: row.setCode,
        collectorNumber: row.collectorNumber,
        isFoil: row.isFoil,
      });
      this.nameIndex.set(nameKey, existing);
    }

    console.log(
      `[CardMatcher] Built index: ${rows.length} printings, ${this.nameIndex.size} unique names`,
    );
  }

  /**
   * Match a scraped card to a printing in the index.
   * Returns the best match found, or { printingId: null, matchType: "unmatched" }.
   */
  match(card: ScrapedCard): MatchResult {
    // ── Level 0: set code + collector number + foil ─────────────────────────
    // This is the most precise match — (set, collector#, foil) uniquely identifies
    // a Scryfall printing with no ambiguity. Use it whenever the store provides one.
    if (card.setCode && card.collectorNumber) {
      const setKey = `${card.setCode}:${card.collectorNumber}:${card.isFoil}`;
      const printingId = this.setCollectorIndex.get(setKey);
      if (printingId) {
        return { printingId, matchType: "set_collector", confidence: 1.0 };
      }
    }

    // ── Name-based fallbacks ─────────────────────────────────────────────────
    // Strip store-specific variant suffixes before normalising.
    // "Ajani, Outland Chaperone (Borderless 284)" → "Ajani, Outland Chaperone"
    const baseName = stripVariant(card.rawName);
    const normalizedName = normalizeName(baseName);
    const candidates = this.nameIndex.get(normalizedName);

    if (candidates) {
      // ── Level 1: name + set code + foil ──────────────────────────────────
      // Ambiguous if the set has multiple variants (e.g. extended art, borderless).
      if (card.setCode) {
        const bySetFoil = candidates.filter(
          (c) => c.setCode === card.setCode && c.isFoil === card.isFoil,
        );
        if (bySetFoil.length === 1) {
          return { printingId: bySetFoil[0].printingId, matchType: "exact", confidence: 1.0 };
        }
        if (bySetFoil.length > 1) {
          // Multiple variants in the same set — pick first, flag lower confidence
          return { printingId: bySetFoil[0].printingId, matchType: "exact", confidence: 0.8 };
        }
      }

      // ── Level 2: name + foil (ignore set) ────────────────────────────────
      const byFoil = candidates.filter((c) => c.isFoil === card.isFoil);
      if (byFoil.length === 1) {
        return { printingId: byFoil[0].printingId, matchType: "name_foil", confidence: 0.85 };
      }
      if (byFoil.length > 1) {
        return { printingId: byFoil[0].printingId, matchType: "name_foil", confidence: 0.7 };
      }

      // ── Level 3: name only (ignore set and foil) ──────────────────────────
      if (candidates.length === 1) {
        return { printingId: candidates[0].printingId, matchType: "name_only", confidence: 0.7 };
      }
      if (candidates.length > 1) {
        return { printingId: candidates[0].printingId, matchType: "name_only", confidence: 0.6 };
      }
    }

    // ── Level 4: fuzzy (Levenshtein ≤ 2) ─────────────────────────────────────
    // O(n) scan — only reaches here for genuinely unrecognised names.
    let bestDist = 3;
    let bestCandidates: IndexEntry[] | null = null;

    for (const [key, entries] of this.nameIndex) {
      if (Math.abs(key.length - normalizedName.length) >= bestDist) continue;
      const dist = levenshteinDistance(normalizedName, key);
      if (dist < bestDist) {
        bestDist = dist;
        bestCandidates = entries;
      }
    }

    if (bestCandidates) {
      const byFoil = bestCandidates.filter((c) => c.isFoil === card.isFoil);
      const match = byFoil[0] ?? bestCandidates[0];
      const confidence = Math.max(0.5, 1 - bestDist * 0.2);
      return { printingId: match.printingId, matchType: "fuzzy", confidence };
    }

    return { printingId: null, matchType: "unmatched", confidence: 0 };
  }
}
