// Request-body validation for /api/optimize. The body is built from
// localStorage, so any of it can be stale or hand-edited.

import { CARD_CONDITIONS } from "@mtg-au/shared";
import { MAX_BULK_CARDS, MAX_CARD_QTY } from "../config";
import { DEFAULT_PREFS, type Finish, type OptimiseLine, type Prefs } from "./types";

export type OptimiseRequest = { lines: OptimiseLine[]; prefs: Prefs };

const FINISHES: readonly Finish[] = ["nonfoil", "foil", "etched"];
/** More stores than this is no constraint at all — the roster is ~40. */
const MAX_STORES_CAP = 20;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === "string";
const isCents = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isIntIn = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function parseLine(raw: unknown): OptimiseLine | string {
  if (!isObject(raw)) return "Each line must be an object";
  const { lineId, cardId, cardName, qty, printing, printingId, finish, current } = raw;
  if (!isNonEmptyString(lineId) || !isNonEmptyString(cardId) || typeof cardName !== "string") {
    return "Each line needs a lineId, cardId and cardName";
  }
  if (!isIntIn(qty, 1, MAX_CARD_QTY)) return `qty must be a whole number from 1 to ${MAX_CARD_QTY}`;
  if (printing !== "exact" && printing !== "any") return `printing must be "exact" or "any"`;
  if (!(printingId === undefined || printingId === null || isNonEmptyString(printingId))) {
    return "printingId must be a string or null";
  }
  if (printing === "exact" && !printingId) return "An exact line needs a printingId";
  if (!(finish === undefined || finish === null || FINISHES.includes(finish as Finish))) {
    return "finish must be nonfoil, foil or etched";
  }

  let parsedCurrent: OptimiseLine["current"] = null;
  if (current !== undefined && current !== null) {
    if (
      !isObject(current) || !isNonEmptyString(current.printingId) || !isNonEmptyString(current.storeId)
      || !isNullableString(current.condition) || !isNullableString(current.url) || !isCents(current.seenCents)
    ) {
      return "current must be { printingId, storeId, condition, url, seenCents }";
    }
    parsedCurrent = {
      printingId: current.printingId,
      storeId: current.storeId,
      condition: current.condition,
      url: current.url,
      seenCents: current.seenCents,
    };
  }

  return {
    lineId, cardId, cardName, qty, printing,
    printingId: printingId ?? null,
    finish: (finish as Finish | null | undefined) ?? null,
    current: parsedCurrent,
  };
}

function parsePrefs(raw: unknown): Prefs | string {
  if (raw === undefined) return { ...DEFAULT_PREFS, postageOverrides: {} };
  if (!isObject(raw)) return "prefs must be an object";
  const prefs: Prefs = { ...DEFAULT_PREFS, postageOverrides: {} };

  if (raw.minCondition !== undefined) {
    if (raw.minCondition !== "any" && !(CARD_CONDITIONS as readonly unknown[]).includes(raw.minCondition)) {
      return `minCondition must be one of ${CARD_CONDITIONS.join(", ")} or any`;
    }
    prefs.minCondition = raw.minCondition as Prefs["minCondition"];
  }
  if (raw.finish !== undefined) {
    if (raw.finish !== "any" && !FINISHES.includes(raw.finish as Finish)) return "finish must be nonfoil, foil, etched or any";
    prefs.finish = raw.finish as Prefs["finish"];
  }
  if (raw.excludeStores !== undefined) {
    if (!Array.isArray(raw.excludeStores) || !raw.excludeStores.every(isNonEmptyString)) {
      return "excludeStores must be an array of store ids";
    }
    prefs.excludeStores = raw.excludeStores;
  }
  if (raw.includeEbay !== undefined) {
    if (typeof raw.includeEbay !== "boolean") return "includeEbay must be true or false";
    prefs.includeEbay = raw.includeEbay;
  }
  if (raw.maxStores !== undefined && raw.maxStores !== null) {
    if (!isIntIn(raw.maxStores, 1, MAX_STORES_CAP)) return `maxStores must be from 1 to ${MAX_STORES_CAP}`;
    prefs.maxStores = raw.maxStores;
  }
  if (raw.postageOverrides !== undefined) {
    if (!isObject(raw.postageOverrides)) return "postageOverrides must be an object";
    for (const [storeId, cents] of Object.entries(raw.postageOverrides)) {
      if (!isCents(cents)) return `Invalid postage override for ${storeId}`;
      prefs.postageOverrides[storeId] = cents;
    }
  }
  return prefs;
}

/** Parses the POST body, or returns an error message for a 400. */
export function parseOptimiseRequest(body: unknown): OptimiseRequest | { error: string } {
  if (!isObject(body)) return { error: "Expected a JSON object" };
  if (!Array.isArray(body.lines) || body.lines.length === 0) return { error: "Expected { lines: OptimiseLine[] }" };
  if (body.lines.length > MAX_BULK_CARDS) return { error: `At most ${MAX_BULK_CARDS} lines can be optimised at once` };

  const lines: OptimiseLine[] = [];
  const seen = new Set<string>();
  for (const raw of body.lines) {
    const line = parseLine(raw);
    if (typeof line === "string") return { error: line };
    if (seen.has(line.lineId)) return { error: `Duplicate lineId ${line.lineId}` };
    seen.add(line.lineId);
    lines.push(line);
  }

  const prefs = parsePrefs(body.prefs);
  if (typeof prefs === "string") return { error: prefs };
  return { lines, prefs };
}
