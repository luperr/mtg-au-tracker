import { describe, it, expect } from "vitest";
import { normalizeName, stripVariant, levenshteinDistance, normalizeSetName, extractTreatment } from "./matching.js";

// ─── normalizeName ────────────────────────────────────────────────────────────

describe("normalizeName", () => {
  it("lowercases and preserves spaces", () => {
    expect(normalizeName("Lightning Bolt")).toBe("lightning bolt");
  });

  it("replaces apostrophes with spaces (they are non-alphanumeric)", () => {
    // normalizeName replaces ALL non-alphanumeric chars with spaces — apostrophe becomes a space
    expect(normalizeName("Teferi's Protection")).toBe("teferi s protection");
  });

  it("strips accent combining diacritics (é → e)", () => {
    expect(normalizeName("Jötun Grunt")).toBe("jotun grunt");
  });

  it("strips dots and collapses to spaces", () => {
    expect(normalizeName("B.F.M.")).toBe("b f m");
  });

  it("strips brackets along with surrounding punctuation", () => {
    expect(normalizeName("B.F.M. (Big Furry Monster)")).toBe("b f m big furry monster");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeName("  extra   spaces  ")).toBe("extra spaces");
  });

  it("handles empty string", () => {
    expect(normalizeName("")).toBe("");
  });

  it("handles all caps", () => {
    expect(normalizeName("LIGHTNING BOLT")).toBe("lightning bolt");
  });

  it("strips commas and hyphens", () => {
    expect(normalizeName("Urza, Lord High Artificer")).toBe("urza lord high artificer");
  });

  it("apostrophe in Urza's Saga becomes a space", () => {
    expect(normalizeName("Urza's Saga")).toBe("urza s saga");
  });

  it("normalizes DFC names — // becomes a space", () => {
    expect(normalizeName("Delver of Secrets // Insectile Aberration")).toBe(
      "delver of secrets insectile aberration"
    );
  });

  it("strips colons (set name separators)", () => {
    expect(normalizeName("Ravnica: City of Guilds")).toBe("ravnica city of guilds");
  });

  it("apostrophe in possessives becomes a space (not removed)", () => {
    // Important: card matching relies on this — "Urza's" normalizes to "urza s"
    // on BOTH the Scryfall side and the store side, so matching still works
    expect(normalizeName("Urza's Mine")).toBe("urza s mine");
  });
});

// ─── stripVariant ─────────────────────────────────────────────────────────────

describe("stripVariant", () => {
  it("strips trailing round brackets", () => {
    expect(stripVariant("Ajani, Outland Chaperone (Borderless 284)")).toBe(
      "Ajani, Outland Chaperone"
    );
  });

  it("strips trailing square brackets", () => {
    expect(stripVariant("Thoughtseize [Theros]")).toBe("Thoughtseize");
  });

  it("strips multiple bracket pairs in multiple passes", () => {
    expect(stripVariant("Mox Pearl (Alpha) (Graded)")).toBe("Mox Pearl");
  });

  it("strips two different bracket types", () => {
    expect(stripVariant("Dark Confidant (Borderless) [FNM Promo]")).toBe("Dark Confidant");
  });

  it("leaves names with no brackets unchanged", () => {
    expect(stripVariant("Lightning Bolt")).toBe("Lightning Bolt");
  });

  it("handles extended art annotation", () => {
    expect(stripVariant("Yawgmoth, Thran Physician (Extended Art)")).toBe(
      "Yawgmoth, Thran Physician"
    );
  });

  it("returns empty string when entire name is in brackets", () => {
    expect(stripVariant("(Just Brackets)")).toBe("");
  });

  it("leaves mid-name brackets untouched — only strips trailing", () => {
    // "Urza's (really good) Card" — middle bracket should not be stripped
    expect(stripVariant("Name (middle) word")).toBe("Name (middle) word");
  });
});

// ─── levenshteinDistance ──────────────────────────────────────────────────────

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("lightning bolt", "lightning bolt")).toBe(0);
  });

  it("returns string length when one input is empty", () => {
    expect(levenshteinDistance("", "bolt")).toBe(4);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("returns 1 for a single deletion", () => {
    // "lighning bolt" is missing the 't' in "lightning"
    expect(levenshteinDistance("lighning bolt", "lightning bolt")).toBe(1);
  });

  it("returns 1 for a single insertion", () => {
    expect(levenshteinDistance("llightning bolt", "lightning bolt")).toBe(1);
  });

  it("returns 1 for a single substitution", () => {
    expect(levenshteinDistance("lightning balt", "lightning bolt")).toBe(1);
  });

  it("returns 2 for two edits", () => {
    // swap 'g' and 'h' positions — two substitutions
    expect(levenshteinDistance("lghitning bolt", "lightning bolt")).toBe(2);
  });

  it("handles the classic kitten/sitting example (3 edits)", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("returns 0 for short identical strings", () => {
    expect(levenshteinDistance("abc", "abc")).toBe(0);
  });

  it("is symmetric", () => {
    const a = "tarmogoyf";
    const b = "tarmogoyff";
    expect(levenshteinDistance(a, b)).toBe(levenshteinDistance(b, a));
  });
});

// ─── normalizeSetName ─────────────────────────────────────────────────────────

describe("normalizeSetName", () => {
  it("lowercases and strips punctuation like normalizeName", () => {
    expect(normalizeSetName("FINAL FANTASY")).toBe("final fantasy");
  });

  it("handles colons and dashes", () => {
    expect(normalizeSetName("Magic: The Gathering - Revised")).toBe(
      "magic the gathering revised"
    );
  });

  it("handles set names with colons", () => {
    expect(normalizeSetName("Ravnica: City of Guilds")).toBe("ravnica city of guilds");
  });

  it("produces the same output as normalizeName for the same input", () => {
    const input = "Wilds of Eldraine";
    const { normalizeName: nn } = { normalizeName };
    expect(normalizeSetName(input)).toBe(normalizeName(input));
  });
});

// ─── extractTreatment ─────────────────────────────────────────────────────────

describe("extractTreatment", () => {
  it("detects extended art", () => {
    expect(extractTreatment("Tarmogoyf (Extended Art)")).toBe("extendedart");
  });

  it("detects extended art with hyphen", () => {
    expect(extractTreatment("Tarmogoyf Extended-Art NM")).toBe("extendedart");
  });

  it("detects showcase", () => {
    expect(extractTreatment("Delver of Secrets (Showcase) Foil")).toBe("showcase");
  });

  it("detects borderless", () => {
    expect(extractTreatment("Black Lotus (Borderless)")).toBe("borderless");
  });

  it("detects full art", () => {
    expect(extractTreatment("Plains (Full Art)")).toBe("fullart");
  });

  it("detects full art with hyphen", () => {
    expect(extractTreatment("Forest Full-Art")).toBe("fullart");
  });

  it("prefers extendedart over borderless when both appear", () => {
    expect(extractTreatment("Card (Borderless Extended Art)")).toBe("extendedart");
  });

  it("returns undefined for plain card names", () => {
    expect(extractTreatment("Lightning Bolt NM")).toBeUndefined();
  });

  it("returns undefined for foil-only annotations", () => {
    expect(extractTreatment("Sol Ring Foil NM")).toBeUndefined();
  });
});
