/**
 * CardMatcher — matches scraped store listings to Scryfall printings in the DB.
 *
 * Strategy:
 *   0. Set+collector — set code + collector number + finish (confidence 1.0)
 *        Uniquely identifies a Scryfall printing. Used whenever the store provides
 *        a collector number (e.g. MTG Mate, Gameology, Good Games via SKU).
 *
 *   1–3. Elimination pipeline — gather all candidates by name, then narrow:
 *        a. by set code  (never zeros out — only applies if result is non-empty)
 *        b. by finish/foil
 *        c. by treatment (borderless / showcase / extendedart / fullart)
 *        Confidence is scored by how many candidates remain after narrowing.
 *
 *   4. Front-face — DFC front face name (e.g. "Delver of Secrets") (confidence 0.65→0.5)
 *   5. Fuzzy      — Levenshtein distance ≤ 2 on normalised name    (confidence 0.5+)
 *   6. Unmatched  — saved to unmatched_cards table for review
 *
 * Build the index once per scrape run (loads all printings from DB into memory),
 * then call match() for each scraped card — no further DB queries.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { normalizeName, normalizeSetName, stripVariant, levenshteinDistance } from "@mtg-au/shared";
import type { ScrapedCard } from "@mtg-au/shared";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "card-matcher" });

export interface MatchResult {
  printingId: string | null;
  matchType: "set_collector" | "exact" | "name_foil" | "name_only" | "front_face" | "fuzzy" | "unmatched";
  confidence: number;
}

interface IndexEntry {
  printingId: string;
  setCode: string;
  collectorNumber: string;
  isFoil: boolean;
  finish: "nonfoil" | "foil" | "etched";
  borderColor: string | null;
  frameEffects: string[];
}

export class CardMatcher {
  // Primary index: "${setCode}:${collectorNumber}:${foil}" → printingId
  // Uniquely identifies a printing — O(1) lookup, no ambiguity.
  private setCollectorIndex = new Map<string, string>();

  // Fallback index: normalizedName → list of matching printings
  // Used when a store doesn't provide a collector number.
  private nameIndex = new Map<string, IndexEntry[]>();

  // Front-face index: normalizedFrontFaceName → list of matching printings
  // For DFC cards only (e.g. "delver of secrets" → printings for
  // "Delver of Secrets // Insectile Aberration"). Used when a store lists
  // only the front face name without the back face.
  private frontFaceIndex = new Map<string, IndexEntry[]>();

  // Set name → set code index built from the DB.
  // Allows stores that provide a human-readable set name (Good Games) to benefit
  // from set-based matching without needing a static SET_ALIASES lookup.
  private setNameIndex = new Map<string, string>(); // normalizedSetName → setCode

  /**
   * Load all printings from the DB and build both lookup indexes.
   * Call once before running match() on any cards.
   */
  async build(): Promise<void> {
    const rows = await db
      .select({
        id: schema.printings.id,
        setCode: schema.printings.setCode,
        setName: schema.printings.setName,
        collectorNumber: schema.printings.collectorNumber,
        isFoil: schema.printings.isFoil,
        finish: schema.printings.finish,
        borderColor: schema.printings.borderColor,
        frameEffects: schema.printings.frameEffects,
        cardName: schema.cards.name,
      })
      .from(schema.printings)
      .innerJoin(schema.cards, eq(schema.printings.cardId, schema.cards.id));

    for (const row of rows) {
      // Primary: set + collector + finish → exact printing (finish string avoids etched/foil collision)
      const finish = (row.finish as string) ?? (row.isFoil ? "foil" : "nonfoil");
      const setKey = `${row.setCode}:${row.collectorNumber}:${finish}`;
      this.setCollectorIndex.set(setKey, row.id);

      // Set name → code (e.g. "FINAL FANTASY" → "fin")
      // Last writer wins — fine since each setCode maps to one canonical setName.
      this.setNameIndex.set(normalizeSetName(row.setName), row.setCode);

      // Fallback: name → candidates
      const nameKey = normalizeName(row.cardName);
      const entry: IndexEntry = {
        printingId: row.id,
        setCode: row.setCode,
        collectorNumber: row.collectorNumber,
        isFoil: row.isFoil,
        finish: (row.finish as "nonfoil" | "foil" | "etched") ?? (row.isFoil ? "foil" : "nonfoil"),
        borderColor: row.borderColor,
        frameEffects: row.frameEffects,
      };
      const existing = this.nameIndex.get(nameKey) ?? [];
      existing.push(entry);
      // Keep sorted by collector number ascending so regular printings
      // (low collector numbers) are always preferred over borderless/showcase/
      // extended-art variants (which Scryfall assigns high collector numbers).
      existing.sort((a, b) => {
        const an = parseInt(a.collectorNumber, 10);
        const bn = parseInt(b.collectorNumber, 10);
        if (isNaN(an) && isNaN(bn)) return 0;
        if (isNaN(an)) return 1;
        if (isNaN(bn)) return -1;
        return an - bn;
      });
      this.nameIndex.set(nameKey, existing);

      // Front-face index: for DFC cards, also index by front face name alone.
      // e.g. "Delver of Secrets // Insectile Aberration" → key "delver of secrets"
      if (row.cardName.includes(" // ")) {
        const frontKey = normalizeName(row.cardName.split(" // ")[0]);
        const frontExisting = this.frontFaceIndex.get(frontKey) ?? [];
        frontExisting.push(entry);
        this.frontFaceIndex.set(frontKey, frontExisting);
      }
    }

    log.info(
      { printings: rows.length, unique_names: this.nameIndex.size },
      "Card matcher index built",
    );
  }

  /**
   * Populate indexes from a plain array — no DB required.
   * Used only in unit tests.
   */
  buildForTesting(entries: {
    id: string;
    setCode: string;
    setName: string;
    collectorNumber: string;
    isFoil: boolean;
    finish?: "nonfoil" | "foil" | "etched";
    borderColor?: string | null;
    frameEffects?: string[];
    cardName: string;
  }[]): void {
    for (const row of entries) {
      const finish = row.finish ?? (row.isFoil ? "foil" : "nonfoil");
      const setKey = `${row.setCode}:${row.collectorNumber}:${finish}`;
      this.setCollectorIndex.set(setKey, row.id);

      this.setNameIndex.set(normalizeSetName(row.setName), row.setCode);

      const nameKey = normalizeName(row.cardName);
      const entry: IndexEntry = {
        printingId: row.id,
        setCode: row.setCode,
        collectorNumber: row.collectorNumber,
        isFoil: row.isFoil,
        finish,
        borderColor: row.borderColor ?? null,
        frameEffects: row.frameEffects ?? [],
      };
      const existing = this.nameIndex.get(nameKey) ?? [];
      existing.push(entry);
      existing.sort((a, b) => {
        const an = parseInt(a.collectorNumber, 10);
        const bn = parseInt(b.collectorNumber, 10);
        if (isNaN(an) && isNaN(bn)) return 0;
        if (isNaN(an)) return 1;
        if (isNaN(bn)) return -1;
        return an - bn;
      });
      this.nameIndex.set(nameKey, existing);

      if (row.cardName.includes(" // ")) {
        const frontKey = normalizeName(row.cardName.split(" // ")[0]);
        const frontExisting = this.frontFaceIndex.get(frontKey) ?? [];
        frontExisting.push(entry);
        this.frontFaceIndex.set(frontKey, frontExisting);
      }
    }
  }

  /**
   * Match a scraped card to a printing in the index.
   * Returns the best match found, or { printingId: null, matchType: "unmatched" }.
   */
  match(card: ScrapedCard): MatchResult {
    const resolvedSetCode = card.setCode
      ?? (card.setName ? (this.setNameIndex.get(normalizeSetName(card.setName)) ?? null) : null);

    // ── L0: set + collector + finish ─────────────────────────────────────────
    if (resolvedSetCode && card.collectorNumber) {
      const cardFinish = card.finish ?? (card.isFoil ? "foil" : "nonfoil");
      const setKey = `${resolvedSetCode}:${card.collectorNumber}:${cardFinish}`;
      const printingId = this.setCollectorIndex.get(setKey);
      if (printingId) {
        return { printingId, matchType: "set_collector", confidence: 1.0 };
      }
    }

    // ── Name lookup ───────────────────────────────────────────────────────────
    const baseName = stripVariant(card.rawName);
    const normalizedName = normalizeName(baseName);

    const byName = this.nameIndex.get(normalizedName);

    if (byName) {
      return this.eliminationMatch(byName, card, resolvedSetCode, "exact", "name_foil");
    }

    // ── Front-face fallback (DFC) ─────────────────────────────────────────────
    const byFrontFace = this.frontFaceIndex.get(normalizedName);
    if (byFrontFace) {
      return this.eliminationMatch(byFrontFace, card, resolvedSetCode, "front_face", "front_face");
    }

    // ── Fuzzy fallback (Levenshtein ≤ 2) ─────────────────────────────────────
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
      const byFoil = card.finish
        ? bestCandidates.filter((c) => c.finish === card.finish)
        : bestCandidates.filter((c) => c.isFoil === card.isFoil);
      const match = byFoil[0] ?? bestCandidates[0];
      return { printingId: match.printingId, matchType: "fuzzy", confidence: Math.max(0.5, 1 - bestDist * 0.2) };
    }

    return { printingId: null, matchType: "unmatched", confidence: 0 };
  }

  /**
   * Elimination pipeline: narrow a candidate pool using every available signal,
   * never zeroing out. Returns the best match with a confidence score.
   *
   * matchTypeWithSet / matchTypeWithoutSet control what matchType is reported
   * so callers can distinguish exact (name+set) from front_face paths.
   */
  private eliminationMatch(
    candidates: IndexEntry[],
    card: ScrapedCard,
    resolvedSetCode: string | null,
    matchTypeWithSet: MatchResult["matchType"],
    matchTypeWithoutSet: MatchResult["matchType"],
  ): MatchResult {
    const initial = candidates.length;
    let pool = candidates;

    // 1. Narrow by set
    const setApplied = resolvedSetCode !== null;
    if (setApplied) {
      pool = narrow(pool, (e) => e.setCode === resolvedSetCode);
    }

    // 2. Narrow by finish/foil
    pool = narrow(pool, card.finish
      ? (e) => e.finish === card.finish
      : (e) => e.isFoil === card.isFoil,
    );

    // 3. Narrow by treatment (borderless / showcase / extendedart / fullart)
    const treatment = card.treatment ?? (card.isBorderless ? "borderless" : undefined);
    if (treatment) {
      pool = narrow(pool, byTreatment(treatment));
    }

    const final = pool.length;
    const matchType = setApplied ? matchTypeWithSet : matchTypeWithoutSet === "front_face" ? "front_face" : (final === 1 ? "name_foil" : "name_only");
    const confidence = scoreConfidence(initial, final, { set: setApplied, treatment: treatment !== undefined });

    return { printingId: pool[0].printingId, matchType, confidence };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Apply filter to candidates — if the result would be empty, return the
 * original pool unchanged. This ensures we never zero out by over-filtering.
 */
function narrow(candidates: IndexEntry[], filter: (e: IndexEntry) => boolean): IndexEntry[] {
  const filtered = candidates.filter(filter);
  return filtered.length > 0 ? filtered : candidates;
}

/**
 * Returns a filter that matches a printing's visual treatment against a
 * canonical treatment tag extracted from the store title.
 */
function byTreatment(treatment: string): (e: IndexEntry) => boolean {
  return (e: IndexEntry) => {
    if (treatment === "borderless")  return e.borderColor === "borderless";
    if (treatment === "showcase")    return e.frameEffects.includes("showcase");
    if (treatment === "extendedart") return e.frameEffects.includes("extendedart");
    if (treatment === "fullart")     return e.frameEffects.includes("fullart");
    return true; // unknown treatment → don't filter
  };
}

/**
 * Confidence score based on how many candidates remain after elimination
 * and which signals were available.
 */
function scoreConfidence(
  initial: number,
  final: number,
  signals: { set: boolean; treatment: boolean },
): number {
  if (final === 1) {
    if (signals.set) return 1.0;   // set+finish narrowed to a unique printing — unambiguous
    if (signals.treatment) return 0.95; // treatment alone narrowed without set
    return 0.85; // name + finish uniquely identified one printing, no set signal
  }
  // Multiple candidates remain — grade by reduction and signals used
  if (signals.set) return final <= 3 ? 0.75 : 0.65;
  const reduction = 1 - final / initial;
  return Math.max(0.5, 0.6 + reduction * 0.1);
}
