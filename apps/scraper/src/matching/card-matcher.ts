/**
 * CardMatcher — matches scraped store listings to Scryfall printings in the DB.
 *
 * Strategy (in order):
 *   1. Exact      — normalised name + set code + foil flag            (confidence 1.0)
 *   2. Name+foil  — normalised name + foil flag, ignores set          (confidence 0.85 → 0.7)
 *   3. Name-only  — normalised name, ignores set and foil             (confidence 0.7  → 0.6)
 *   4. Fuzzy      — Levenshtein distance ≤ 2 on normalised name       (confidence 0.5+)
 *   5. Unmatched  — saved to unmatched_cards table for review
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
  matchType: "exact" | "name_foil" | "name_only" | "fuzzy" | "unmatched";
  confidence: number;
}

interface IndexEntry {
  printingId: string;
  setCode: string;
  isFoil: boolean;
}

export class CardMatcher {
  // normalizedName → list of printings with that name
  private index = new Map<string, IndexEntry[]>();

  /**
   * Load all printings from the DB and build the in-memory lookup index.
   * Call once before running match() on any cards.
   */
  async build(): Promise<void> {
    const rows = await db
      .select({
        id: schema.printings.id,
        setCode: schema.printings.setCode,
        isFoil: schema.printings.isFoil,
        cardName: schema.cards.name,
      })
      .from(schema.printings)
      .innerJoin(schema.cards, eq(schema.printings.cardId, schema.cards.id));

    for (const row of rows) {
      const key = normalizeName(row.cardName);
      const existing = this.index.get(key) ?? [];
      existing.push({ printingId: row.id, setCode: row.setCode, isFoil: row.isFoil });
      this.index.set(key, existing);
    }

    console.log(
      `[CardMatcher] Built index: ${rows.length} printings, ${this.index.size} unique names`,
    );
  }

  /**
   * Match a scraped card to a printing in the index.
   * Returns the best match found, or { printingId: null, matchType: "unmatched" }.
   */
  match(card: ScrapedCard): MatchResult {
    // Strip store-specific variant suffixes before normalising.
    // "Ajani, Outland Chaperone (Borderless 284)" → "Ajani, Outland Chaperone"
    const baseName = stripVariant(card.rawName);
    const normalizedName = normalizeName(baseName);

    const candidates = this.index.get(normalizedName);

    if (candidates) {
      // ── Level 1: name + set code + foil ────────────────────────────────────
      if (card.setCode) {
        const exact = candidates.find(
          (c) => c.setCode === card.setCode && c.isFoil === card.isFoil,
        );
        if (exact) {
          return { printingId: exact.printingId, matchType: "exact", confidence: 1.0 };
        }
      }

      // ── Level 2: name + foil (ignore set) ──────────────────────────────────
      const byFoil = candidates.filter((c) => c.isFoil === card.isFoil);
      if (byFoil.length === 1) {
        return { printingId: byFoil[0].printingId, matchType: "name_foil", confidence: 0.85 };
      }
      if (byFoil.length > 1) {
        // Multiple printings — pick first; confidence lower since set is unknown
        return { printingId: byFoil[0].printingId, matchType: "name_foil", confidence: 0.7 };
      }

      // ── Level 3: name only (ignore set and foil) ────────────────────────────
      if (candidates.length === 1) {
        return { printingId: candidates[0].printingId, matchType: "name_only", confidence: 0.7 };
      }
      if (candidates.length > 1) {
        return { printingId: candidates[0].printingId, matchType: "name_only", confidence: 0.6 };
      }
    }

    // ── Level 4: fuzzy (Levenshtein ≤ 2) ─────────────────────────────────────
    // O(n) scan over all indexed names — acceptable for the small number of
    // cards that reach this point. Revisit if performance becomes an issue.
    let bestDist = 3; // exclusive upper bound
    let bestCandidates: IndexEntry[] | null = null;

    for (const [key, entries] of this.index) {
      // Skip if length difference alone exceeds our threshold (cheap early exit)
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
      // Scale confidence: distance 1 → ~0.8, distance 2 → ~0.6
      const confidence = Math.max(0.5, 1 - bestDist * 0.2);
      return { printingId: match.printingId, matchType: "fuzzy", confidence };
    }

    return { printingId: null, matchType: "unmatched", confidence: 0 };
  }
}
