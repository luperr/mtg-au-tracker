/**
 * DB-derived set recognition for eBay title parsing.
 *
 * Builds a lookup of every Scryfall set code + full set name present in the DB
 * at import time (mirroring CardMatcher's own setNameIndex), so a newly
 * imported set is recognised in eBay titles the moment its printings land —
 * no manual regex update needed per release.
 *
 * This is checked *before* the legacy SLANG_SET_PATTERNS fallback in
 * transform.ts, which is now only needed for genuine community slang that
 * doesn't literally match any Scryfall set code or name (e.g. "3rd ed", "fca").
 */

import { db, schema } from "../lib/db.js";

export interface SetRecognizer {
  /** setCode (lowercase) -> canonical setName, for every set present in the DB. */
  codeToName: Map<string, string>;
  /** Precompiled whole-word matchers per set name, longest name first (most specific). */
  nameMatchers: Array<{ setCode: string; re: RegExp }>;
}

const EMPTY_RECOGNIZER: SetRecognizer = { codeToName: new Map(), nameMatchers: [] };

/** A recognizer with no data — set recognition falls through to the slang list only. */
export function emptySetRecognizer(): SetRecognizer {
  return EMPTY_RECOGNIZER;
}

/** Load all distinct (setCode, setName) pairs from the DB and build the recognizer. */
export async function buildSetRecognizer(): Promise<SetRecognizer> {
  const rows = await db
    .selectDistinct({
      setCode: schema.printings.setCode,
      setName: schema.printings.setName,
    })
    .from(schema.printings);

  const codeToName = new Map<string, string>();
  const seenNames = new Set<string>();
  const names: Array<{ setCode: string; setName: string }> = [];

  for (const row of rows) {
    if (!row.setCode || !row.setName) continue;
    codeToName.set(row.setCode.toLowerCase(), row.setName);
    if (!seenNames.has(row.setName)) {
      seenNames.add(row.setName);
      names.push({ setCode: row.setCode, setName: row.setName });
    }
  }

  // Longest name first so a specific set ("Kamigawa: Neon Dynasty") is tried
  // before a shorter one that might be a substring of another's title text.
  names.sort((a, b) => b.setName.length - a.setName.length);

  const nameMatchers = names.map(({ setCode, setName }) => ({
    setCode,
    re: new RegExp(`\\b${escapeRegExp(setName)}\\b`, "i"),
  }));

  return { codeToName, nameMatchers };
}

const CODE_TOKEN_RE = /\b[a-z0-9]{2,5}\b/gi;

/**
 * Recognise a set from an eBay title using DB-derived data only: a literal
 * full set name, or a whole-word Scryfall set code. Returns the canonical
 * Scryfall set name, or null if nothing in the DB matched.
 */
export function recognizeSetFromDb(title: string, recognizer: SetRecognizer): string | null {
  for (const { setCode, re } of recognizer.nameMatchers) {
    if (re.test(title)) return recognizer.codeToName.get(setCode.toLowerCase()) ?? null;
  }

  const tokens = title.match(CODE_TOKEN_RE) ?? [];
  for (const token of tokens) {
    const name = recognizer.codeToName.get(token.toLowerCase());
    if (name) return name;
  }

  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
