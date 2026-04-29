/**
 * Analyses the unmatched_cards table for eBay AU entries and suggests
 * SET_ALIASES entries and name corrections that would improve match rates.
 *
 * Output:
 *   Section 1 — Ready-to-paste SET_ALIASES (HIGH confidence, distance 0)
 *   Section 2 — Needs review (MEDIUM/LOW confidence, distance 1-2)
 *   Section 3 — Name corrections (distance 1, frequency ≥ 3)
 *   Section 4 — Top 20 most-frequent unmatched names (may need transform.ts tuning)
 *
 * This tool NEVER writes to matching.ts — it prints suggestions only.
 *
 * Usage:
 *   pnpm --filter @mtg-au/scraper suggest:aliases
 */

import { db, schema } from "../lib/db.js";
import { eq, isNotNull, sql } from "drizzle-orm";
import {
  normalizeName,
  normalizeSetName,
  levenshteinDistance,
  SET_ALIASES,
} from "@mtg-au/shared";

// ── Confidence tiers ──────────────────────────────────────────────────────────

type Confidence = "HIGH" | "MEDIUM" | "LOW";

function tier(distance: number): Confidence | null {
  if (distance === 0) return "HIGH";
  if (distance === 1) return "MEDIUM";
  if (distance === 2) return "LOW";
  return null;
}

// ── Load known set names from DB ──────────────────────────────────────────────

async function loadSetIndex(): Promise<Map<string, { setCode: string; setName: string }>> {
  const rows = await db
    .select({ setCode: schema.sets.setCode, setName: schema.sets.setName })
    .from(schema.sets);

  const index = new Map<string, { setCode: string; setName: string }>();
  for (const row of rows) {
    const normalised = normalizeSetName(row.setName);
    index.set(normalised, { setCode: row.setCode, setName: row.setName });
  }
  return index;
}

// ── Load known card names from DB ─────────────────────────────────────────────

async function loadCardNameIndex(): Promise<Map<string, string>> {
  const rows = await db
    .select({ name: schema.cards.name })
    .from(schema.cards);

  const index = new Map<string, string>();
  for (const row of rows) {
    index.set(normalizeName(row.name), row.name);
  }
  return index;
}

// ── Suggest SET_ALIASES ───────────────────────────────────────────────────────

interface SetAliasSuggestion {
  rawSetName: string;
  normalised: string;
  suggestedSetCode: string;
  suggestedSetName: string;
  distance: number;
  frequency: number;
  confidence: Confidence;
}

async function suggestSetAliases(
  setIndex: Map<string, { setCode: string; setName: string }>,
): Promise<SetAliasSuggestion[]> {
  const rows = await db.execute<{ raw_set_name: string; frequency: string }>(sql`
    SELECT raw_set_name, COUNT(*)::text AS frequency
    FROM ${schema.unmatchedCards}
    WHERE store_id = 'ebay_au'
      AND raw_set_name IS NOT NULL
      AND raw_set_name != ''
    GROUP BY raw_set_name
    ORDER BY COUNT(*) DESC
    LIMIT 200
  `);

  const suggestions: SetAliasSuggestion[] = [];

  for (const row of rows) {
    const raw = row.raw_set_name;
    const normalised = normalizeSetName(raw);
    const freq = parseInt(row.frequency, 10);

    // Skip if already in SET_ALIASES
    if (SET_ALIASES[normalised]) continue;

    // Skip if already an exact match in the set index
    if (setIndex.has(normalised)) continue;

    // Find the closest matching known set name
    let bestDistance = Infinity;
    let bestMatch: { setCode: string; setName: string } | null = null;

    for (const [key, val] of setIndex) {
      const d = levenshteinDistance(normalised, key);
      if (d < bestDistance) {
        bestDistance = d;
        bestMatch = val;
      }
      if (d === 0) break; // can't get better
    }

    if (!bestMatch) continue;
    const confidence = tier(bestDistance);
    if (!confidence) continue;

    suggestions.push({
      rawSetName: raw,
      normalised,
      suggestedSetCode: bestMatch.setCode,
      suggestedSetName: bestMatch.setName,
      distance: bestDistance,
      frequency: freq,
      confidence,
    });
  }

  return suggestions.sort((a, b) => b.frequency - a.frequency);
}

// ── Suggest name corrections ──────────────────────────────────────────────────

interface NameCorrection {
  rawName: string;
  normalised: string;
  suggestedName: string;
  distance: number;
  frequency: number;
}

async function suggestNameCorrections(
  cardIndex: Map<string, string>,
): Promise<NameCorrection[]> {
  const rows = await db.execute<{ raw_name: string; frequency: string }>(sql`
    SELECT raw_name, COUNT(*)::text AS frequency
    FROM ${schema.unmatchedCards}
    WHERE store_id = 'ebay_au'
      AND raw_name IS NOT NULL
      AND raw_name != ''
    GROUP BY raw_name
    ORDER BY COUNT(*) DESC
    LIMIT 300
  `);

  const corrections: NameCorrection[] = [];

  for (const row of rows) {
    const raw = row.raw_name;
    const freq = parseInt(row.frequency, 10);

    if (freq < 3) continue; // ignore noise

    const normalised = normalizeName(raw);

    // Skip if already an exact match
    if (cardIndex.has(normalised)) continue;

    // Find closest card name
    let bestDistance = Infinity;
    let bestName = "";

    for (const [key, name] of cardIndex) {
      const d = levenshteinDistance(normalised, key);
      if (d < bestDistance) {
        bestDistance = d;
        bestName = name;
      }
      if (d === 0) break;
    }

    if (bestDistance !== 1) continue; // only propose single-edit corrections

    corrections.push({
      rawName: raw,
      normalised,
      suggestedName: bestName,
      distance: bestDistance,
      frequency: freq,
    });
  }

  return corrections.sort((a, b) => b.frequency - a.frequency);
}

// ── Top unmatched names (may need transform.ts tuning) ───────────────────────

async function topUnmatchedNames(): Promise<{ rawName: string; frequency: number }[]> {
  const rows = await db.execute<{ raw_name: string; frequency: string }>(sql`
    SELECT raw_name, COUNT(*)::text AS frequency
    FROM ${schema.unmatchedCards}
    WHERE store_id = 'ebay_au'
      AND raw_name IS NOT NULL
    GROUP BY raw_name
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `);
  return rows.map((r) => ({ rawName: r.raw_name, frequency: parseInt(r.frequency, 10) }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Loading set index and card index from DB...\n");
  const [setIndex, cardIndex] = await Promise.all([loadSetIndex(), loadCardNameIndex()]);
  console.log(`  ${setIndex.size} sets, ${cardIndex.size} cards\n`);

  const [aliasSuggestions, nameCorrections, topNames] = await Promise.all([
    suggestSetAliases(setIndex),
    suggestNameCorrections(cardIndex),
    topUnmatchedNames(),
  ]);

  const high = aliasSuggestions.filter((s) => s.confidence === "HIGH");
  const medium = aliasSuggestions.filter((s) => s.confidence === "MEDIUM");
  const low = aliasSuggestions.filter((s) => s.confidence === "LOW");

  // ── Section 1: Ready to paste ─────────────────────────────────────────────
  console.log(`${"═".repeat(80)}`);
  console.log(`SECTION 1 — READY TO PASTE (HIGH confidence — ${high.length} entries)`);
  console.log(`Add these to SET_ALIASES in packages/shared/src/utils/matching.ts`);
  console.log(`${"═".repeat(80)}`);
  if (high.length === 0) {
    console.log("  (none)\n");
  } else {
    for (const s of high) {
      const key = JSON.stringify(s.normalised).padEnd(35);
      console.log(`  ${key} ${JSON.stringify(s.suggestedSetCode)},  // ${s.rawSetName} (${s.frequency} occurrences)`);
    }
    console.log();
  }

  // ── Section 2: Needs review ───────────────────────────────────────────────
  console.log(`${"═".repeat(80)}`);
  console.log(`SECTION 2 — NEEDS REVIEW (MEDIUM/LOW confidence — ${medium.length + low.length} entries)`);
  console.log(`${"═".repeat(80)}`);
  if (medium.length === 0 && low.length === 0) {
    console.log("  (none)\n");
  } else {
    for (const s of [...medium, ...low]) {
      console.log(
        `  [${s.confidence.padEnd(6)}] "${s.rawSetName}" → "${s.suggestedSetName}" (${s.suggestedSetCode}) [dist=${s.distance}, freq=${s.frequency}]`,
      );
    }
    console.log();
  }

  // ── Section 3: Name corrections ───────────────────────────────────────────
  console.log(`${"═".repeat(80)}`);
  console.log(`SECTION 3 — NAME CORRECTIONS (distance=1, freq≥3 — ${nameCorrections.length} entries)`);
  console.log(`${"═".repeat(80)}`);
  if (nameCorrections.length === 0) {
    console.log("  (none)\n");
  } else {
    for (const c of nameCorrections) {
      console.log(`  "${c.rawName}" → "${c.suggestedName}" [freq=${c.frequency}]`);
    }
    console.log();
  }

  // ── Section 4: Top unmatched ──────────────────────────────────────────────
  console.log(`${"═".repeat(80)}`);
  console.log(`SECTION 4 — TOP 20 UNMATCHED NAMES (may need transform.ts pattern tuning)`);
  console.log(`${"═".repeat(80)}`);
  for (const n of topNames) {
    console.log(`  "${n.rawName}"  (${n.frequency})`);
  }

  const total = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM ${schema.unmatchedCards} WHERE store_id = 'ebay_au'
  `);
  console.log(`\nTotal eBay unmatched records: ${total[0]?.count ?? "??"}`);
  console.log(`SET_ALIAS candidates: ${high.length} HIGH + ${medium.length} MEDIUM + ${low.length} LOW`);
  console.log(`Name corrections: ${nameCorrections.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
