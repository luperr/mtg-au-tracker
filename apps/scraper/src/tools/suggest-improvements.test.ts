import { describe, it, expect } from "vitest";
import { levenshteinDistance, normalizeSetName, SET_ALIASES } from "@mtg-au/shared";

// Test the alias suggestion algorithm logic — confidence tiers and filtering.
// The actual DB query is not tested here; we test the pure matching logic.

type Confidence = "HIGH" | "MEDIUM" | "LOW";

function tier(distance: number): Confidence | null {
  if (distance === 0) return "HIGH";
  if (distance === 1) return "MEDIUM";
  if (distance === 2) return "LOW";
  return null;
}

function suggestAlias(
  rawSetName: string,
  setIndex: Map<string, { setCode: string; setName: string }>,
): { suggestedSetCode: string; distance: number; confidence: Confidence } | null {
  const normalised = normalizeSetName(rawSetName);

  if (SET_ALIASES[normalised]) return null; // already known
  if (setIndex.has(normalised)) return null; // exact match in DB

  let bestDistance = Infinity;
  let bestMatch: { setCode: string; setName: string } | null = null;

  for (const [key, val] of setIndex) {
    const d = levenshteinDistance(normalised, key);
    if (d < bestDistance) {
      bestDistance = d;
      bestMatch = val;
    }
    if (d === 0) break;
  }

  if (!bestMatch) return null;
  const confidence = tier(bestDistance);
  if (!confidence) return null;

  return { suggestedSetCode: bestMatch.setCode, distance: bestDistance, confidence };
}

// Build a small mock set index
function mockSetIndex(entries: [string, string][]): Map<string, { setCode: string; setName: string }> {
  const m = new Map<string, { setCode: string; setName: string }>();
  for (const [name, code] of entries) {
    m.set(normalizeSetName(name), { setCode: code, setName: name });
  }
  return m;
}

describe("tier() confidence mapping", () => {
  it("returns HIGH for distance 0", () => expect(tier(0)).toBe("HIGH"));
  it("returns MEDIUM for distance 1", () => expect(tier(1)).toBe("MEDIUM"));
  it("returns LOW for distance 2", () => expect(tier(2)).toBe("LOW"));
  it("returns null for distance >= 3", () => {
    expect(tier(3)).toBeNull();
    expect(tier(10)).toBeNull();
  });
});

describe("suggestAlias()", () => {
  const setIndex = mockSetIndex([
    ["Final Fantasy", "fin"],
    ["Dominaria United", "dmu"],
    ["March of the Machine", "mom"],
    ["Wilds of Eldraine", "woe"],
  ]);

  it("returns null for exact DB match (no alias needed)", () => {
    // "FINAL FANTASY" normalises to "final fantasy" which IS in the index → no alias needed
    const result = suggestAlias("FINAL FANTASY", setIndex);
    expect(result).toBeNull();
  });

  it("returns null for exact DB match (same case)", () => {
    const result = suggestAlias("Final Fantasy", setIndex);
    expect(result).toBeNull();
  });

  it("returns MEDIUM confidence for distance 1", () => {
    // "Dominaria Unite" is 1 char short of "Dominaria United"
    const result = suggestAlias("Dominaria Unite", setIndex);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("MEDIUM");
    expect(result!.distance).toBe(1);
    expect(result!.suggestedSetCode).toBe("dmu");
  });

  it("returns LOW confidence for distance 2", () => {
    // "Dominar United" is 2 edit-distance from "Dominaria United"
    const result = suggestAlias("Dominar United", setIndex);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("LOW");
    expect(result!.distance).toBe(2);
  });

  it("returns null for distance >= 3 (too ambiguous)", () => {
    const result = suggestAlias("Completely Wrong Name XYZ", setIndex);
    expect(result).toBeNull();
  });

  it("returns null when rawSetName is already in SET_ALIASES", () => {
    const existingKey = Object.keys(SET_ALIASES)[0];
    if (!existingKey) return; // skip if SET_ALIASES is empty
    const result = suggestAlias(existingKey, setIndex);
    expect(result).toBeNull();
  });
});
