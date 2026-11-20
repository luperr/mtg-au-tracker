import { describe, it, expect } from "vitest";
import { toFamilies } from "./set-families";

const row = (set_code: string, parent_set_code: string | null, released_at = "2026-03-06", set_name = set_code) =>
  ({ set_code, set_name, parent_set_code, released_at });

describe("toFamilies", () => {
  it("folds every descendant under its root, however deep Scryfall nests it", () => {
    // TMNT: tmt → tmc → ttmc / ftmc, plus direct children.
    const [tmt] = toFamilies([
      row("tmt", null, "2026-03-06", "Teenage Mutant Ninja Turtles"), row("tmc", "tmt"), row("ttmc", "tmc"),
      row("ftmc", "tmc"), row("pza", "tmt"), row("ttmt", "tmt"),
    ]);
    expect(tmt.code).toBe("tmt");
    expect(tmt.name).toBe("Teenage Mutant Ninja Turtles");
    expect([...tmt.codes].sort()).toEqual(["ftmc", "pza", "tmc", "tmt", "ttmc", "ttmt"]);
  });

  it("treats a set whose parent isn't in the table as a root, and survives a parent loop", () => {
    const families = toFamilies([row("orphan", "gone"), row("a", "b"), row("b", "a")]);
    expect(families.map((f) => f.code).sort()).toContain("orphan");
    expect(families.flatMap((f) => f.codes).sort()).toEqual(["a", "b", "orphan"]);
  });

  it("lists newest first", () => {
    expect(toFamilies([row("old", null, "2020-01-01"), row("new", null, "2026-01-01")]).map((f) => f.code)).toEqual(["new", "old"]);
  });
});
