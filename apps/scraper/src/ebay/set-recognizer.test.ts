import { describe, it, expect } from "vitest";
import { recognizeSetFromDb, emptySetRecognizer, type SetRecognizer } from "./set-recognizer.js";

function recognizerOf(sets: Array<{ setCode: string; setName: string }>): SetRecognizer {
  const codeToName = new Map<string, string>();
  const names = [...sets].sort((a, b) => b.setName.length - a.setName.length);
  for (const { setCode, setName } of sets) codeToName.set(setCode.toLowerCase(), setName);
  const nameMatchers = names.map(({ setCode, setName }) => ({
    setCode,
    re: new RegExp(`\\b${setName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
  }));
  return { codeToName, nameMatchers };
}

describe("recognizeSetFromDb", () => {
  it("returns null for an empty recognizer", () => {
    expect(recognizeSetFromDb("Lightning Bolt M11 NM", emptySetRecognizer())).toBeNull();
  });

  it("matches a literal full set name in the title", () => {
    const recognizer = recognizerOf([{ setCode: "dmu", setName: "Dominaria United" }]);
    expect(recognizeSetFromDb("Ragavan Dominaria United NM", recognizer)).toBe("Dominaria United");
  });

  it("matches a whole-word Scryfall set code", () => {
    const recognizer = recognizerOf([{ setCode: "m11", setName: "Magic 2011" }]);
    expect(recognizeSetFromDb("Lightning Bolt M11 NM Foil", recognizer)).toBe("Magic 2011");
  });

  it("does not match a code embedded inside another word", () => {
    const recognizer = recognizerOf([{ setCode: "neo", setName: "Kamigawa: Neon Dynasty" }]);
    expect(recognizeSetFromDb("Neopolitan flavour text NM", recognizer)).toBeNull();
  });

  it("prefers the longer, more specific set name when names overlap", () => {
    const recognizer = recognizerOf([
      { setCode: "war", setName: "War of the Spark" },
      { setCode: "nph", setName: "New Phyrexia" },
    ]);
    expect(recognizeSetFromDb("Karn War of the Spark NM", recognizer)).toBe("War of the Spark");
  });

  it("returns null when nothing in the title matches a known code or name", () => {
    const recognizer = recognizerOf([{ setCode: "dmu", setName: "Dominaria United" }]);
    expect(recognizeSetFromDb("Lightning Bolt Foil NM", recognizer)).toBeNull();
  });
});
