import { describe, it, expect } from "vitest";
import { parseSkuData } from "./sku-parser.js";

describe("parseSkuData", () => {
  it("returns nulls for null SKU", () => {
    expect(parseSkuData(null)).toEqual({ setCode: null, collectorNumber: null, isFoil: null });
  });

  it("returns nulls for empty string", () => {
    expect(parseSkuData("")).toEqual({ setCode: null, collectorNumber: null, isFoil: null });
  });

  it("returns nulls for undefined", () => {
    expect(parseSkuData(undefined)).toEqual({ setCode: null, collectorNumber: null, isFoil: null });
  });

  // Format A — Good Games / Plenty of Games
  it("parses nonfoil Format A SKU", () => {
    expect(parseSkuData("MOC-381-EN-NF-1")).toEqual({
      setCode: "moc",
      collectorNumber: "381",
      isFoil: false,
    });
  });

  it("parses foil Format A SKU", () => {
    expect(parseSkuData("MOC-381-EN-FO-1")).toEqual({
      setCode: "moc",
      collectorNumber: "381",
      isFoil: true,
    });
  });

  it("parses Format A SKU with letter-suffixed collector number", () => {
    expect(parseSkuData("PTHB-244S-EN-FO-1")).toEqual({
      setCode: "pthb",
      collectorNumber: "244s",
      isFoil: true,
    });
  });

  it("parses DFC collector number (ignores the //NNN part)", () => {
    expect(parseSkuData("MH3-244//244-EN-NF-1")).toEqual({
      setCode: "mh3",
      collectorNumber: "244",
      isFoil: false,
    });
  });

  // Format B — Gameology
  it("parses Format B (Gameology) SKU — isFoil is null (determined from tags)", () => {
    expect(parseSkuData("MTG-TLA-336-01WREUQWQQ")).toEqual({
      setCode: "tla",
      collectorNumber: "336",
      isFoil: null,
    });
  });

  it("returns nulls for unrecognised SKU format", () => {
    expect(parseSkuData("GARBAGE")).toEqual({ setCode: null, collectorNumber: null, isFoil: null });
  });

  // Format C — Mega Games
  it("parses standard single-letter color code nonfoil", () => {
    expect(parseSkuData("SOS-C-L-0267-N")).toEqual({
      setCode: "sos",
      collectorNumber: "267",
      isFoil: false,
    });
  });

  it("parses standard single-letter color code foil", () => {
    expect(parseSkuData("SOS-C-G-0162-F")).toEqual({
      setCode: "sos",
      collectorNumber: "162",
      isFoil: true,
    });
  });

  it("parses two-char color code Bu (Blue) nonfoil", () => {
    expect(parseSkuData("SOA-U-Bu-0089-N")).toEqual({
      setCode: "soa",
      collectorNumber: "89",
      isFoil: false,
    });
  });

  it("parses two-char color code Bu (Blue) foil", () => {
    expect(parseSkuData("SOA-U-Bu-0153-F")).toEqual({
      setCode: "soa",
      collectorNumber: "153",
      isFoil: true,
    });
  });

  it("parses two-char color code Bk (Black)", () => {
    expect(parseSkuData("EOE-U-Bk-0123-N")).toEqual({
      setCode: "eoe",
      collectorNumber: "123",
      isFoil: false,
    });
  });

  it("strips leading zeros from collector number", () => {
    expect(parseSkuData("DFT-M-M-0001-N")).toEqual({
      setCode: "dft",
      collectorNumber: "1",
      isFoil: false,
    });
  });
});
