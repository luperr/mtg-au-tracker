import { describe, it, expect } from "vitest";
import { parseProductTitle, isSkippedVariant } from "./standard.js";

describe("parseProductTitle", () => {
  it("splits on dash separator", () => {
    expect(parseProductTitle("Lightning Bolt - Magic 2010")).toEqual({
      cardName: "Lightning Bolt",
      setName: "Magic 2010",
    });
  });

  it("splits on em-dash", () => {
    expect(parseProductTitle("Dark Confidant – Ravnica")).toEqual({
      cardName: "Dark Confidant",
      setName: "Ravnica",
    });
  });

  it("splits on round bracket", () => {
    expect(parseProductTitle("Dark Confidant (Ravnica: City of Guilds)")).toEqual({
      cardName: "Dark Confidant",
      setName: "Ravnica: City of Guilds",
    });
  });

  it("splits on square bracket", () => {
    expect(parseProductTitle("Tarmogoyf [Future Sight]")).toEqual({
      cardName: "Tarmogoyf",
      setName: "Future Sight",
    });
  });

  it("returns null setName when no separator found", () => {
    expect(parseProductTitle("Thoughtseize")).toEqual({
      cardName: "Thoughtseize",
      setName: null,
    });
  });

  it("handles apostrophes in card name before dash", () => {
    expect(parseProductTitle("Urza's Saga - Legacy")).toEqual({
      cardName: "Urza's Saga",
      setName: "Legacy",
    });
  });
});

describe("isSkippedVariant", () => {
  it("returns false for Near Mint Nonfoil (standard variant)", () => {
    expect(isSkippedVariant("Near Mint Nonfoil")).toBe(false);
  });

  it("returns false for Near Mint Foil (regular foil is not skipped)", () => {
    expect(isSkippedVariant("Near Mint Foil")).toBe(false);
  });

  it("returns true for Extended Art", () => {
    expect(isSkippedVariant("Extended Art")).toBe(true);
  });

  it("returns true for Showcase", () => {
    expect(isSkippedVariant("Showcase")).toBe(true);
  });

  it("returns true for Retro Frame", () => {
    expect(isSkippedVariant("Retro Frame")).toBe(true);
  });

  it("returns true for Serialized", () => {
    expect(isSkippedVariant("Serialized")).toBe(true);
  });

  it("returns true for Anime variant", () => {
    expect(isSkippedVariant("Anime")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSkippedVariant("EXTENDED ART")).toBe(true);
    expect(isSkippedVariant("showcase")).toBe(true);
  });
});
