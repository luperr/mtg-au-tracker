import { describe, it, expect } from "vitest";
import { normaliseCondition } from "./condition.js";

describe("normaliseCondition", () => {
  // ── Near Mint ──────────────────────────────────────────────────────────────
  it.each([
    ["Near Mint", "NM"],
    ["near mint", "NM"],
    ["NM", "NM"],
    ["nm", "NM"],
    ["Mint", "NM"],
    ["mint", "NM"],
    ["M", "NM"],
    ["m", "NM"],
    ["Regular", "NM"],   // MTG Mate
    ["regular", "NM"],
  ])('maps "%s" → "%s"', (input, expected) => {
    expect(normaliseCondition(input)).toBe(expected);
  });

  // ── Lightly Played ─────────────────────────────────────────────────────────
  it.each([
    ["Lightly Played", "LP"],
    ["Light Played", "LP"],
    ["LP", "LP"],
    ["lp", "LP"],
    ["Excellent", "LP"],
    ["excellent", "LP"],
    ["EX", "LP"],
    ["ex", "LP"],
  ])('maps "%s" → "%s"', (input, expected) => {
    expect(normaliseCondition(input)).toBe(expected);
  });

  // ── Moderately Played ──────────────────────────────────────────────────────
  it.each([
    ["Moderately Played", "MP"],
    ["Moderate Played", "MP"],
    ["MP", "MP"],
    ["mp", "MP"],
    ["Good", "MP"],
    ["good", "MP"],
    ["GD", "MP"],
    ["gd", "MP"],
  ])('maps "%s" → "%s"', (input, expected) => {
    expect(normaliseCondition(input)).toBe(expected);
  });

  // ── Heavily Played ─────────────────────────────────────────────────────────
  it.each([
    ["Heavily Played", "HP"],
    ["Heavy Played", "HP"],
    ["HP", "HP"],
    ["hp", "HP"],
    ["Played", "HP"],
    ["played", "HP"],
  ])('maps "%s" → "%s"', (input, expected) => {
    expect(normaliseCondition(input)).toBe(expected);
  });

  // ── Damaged ────────────────────────────────────────────────────────────────
  it.each([
    ["Damaged", "DMG"],
    ["damaged", "DMG"],
    ["DMG", "DMG"],
    ["dmg", "DMG"],
    ["Poor", "DMG"],
    ["poor", "DMG"],
  ])('maps "%s" → "%s"', (input, expected) => {
    expect(normaliseCondition(input)).toBe(expected);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────
  it("trims whitespace before matching", () => {
    expect(normaliseCondition("  Near Mint  ")).toBe("NM");
    expect(normaliseCondition(" lp ")).toBe("LP");
  });

  it("is case-insensitive", () => {
    expect(normaliseCondition("NEAR MINT")).toBe("NM");
    expect(normaliseCondition("Lightly Played")).toBe("LP");
    expect(normaliseCondition("DAMAGED")).toBe("DMG");
  });

  it("returns trimmed input for unknown conditions", () => {
    expect(normaliseCondition("Signed")).toBe("Signed");
    expect(normaliseCondition("  Altered  ")).toBe("Altered");
  });
});
