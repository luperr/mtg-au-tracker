// Set families: a main set with everything Scryfall nests under it. Pure — the client
// (the exclude-sets picker) and tests import it without the DB client.

/** A main set and every set under it — commander, promos, tokens, art series. */
export type SetFamily = {
  code: string;
  name: string;
  /** YYYY-MM-DD */
  released: string;
  /** This set's code and all its descendants', so excluding the family excludes them all. */
  codes: string[];
};

/**
 * Groups sets under their root by following `parent_set_code` all the way up (Scryfall nests:
 * tmt → tmc → ttmc). A parent missing from the table makes its child a root. Newest first.
 */
export function toFamilies(rows: { set_code: string; set_name: string; parent_set_code: string | null; released_at: string }[]): SetFamily[] {
  const byCode = new Map(rows.map((r) => [r.set_code, r]));
  const rootOf = (code: string): string => {
    const seen = new Set<string>();
    let cur = code;
    for (;;) {
      const parent = byCode.get(cur)?.parent_set_code;
      if (!parent || !byCode.has(parent) || seen.has(parent)) return cur;
      seen.add(cur);
      cur = parent;
    }
  };
  const families = new Map<string, SetFamily>();
  for (const r of rows) {
    const root = byCode.get(rootOf(r.set_code))!;
    let f = families.get(root.set_code);
    if (!f) {
      f = { code: root.set_code, name: root.set_name, released: root.released_at.slice(0, 10), codes: [] };
      families.set(root.set_code, f);
    }
    f.codes.push(r.set_code);
  }
  return [...families.values()].sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name));
}
