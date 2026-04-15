import { createLogger } from "@mtg-au/shared";

export const logger = createLogger("web");

/** Format a number as an AUD price string, e.g. 4.5 → "$4.50" */
export function fmtAUD(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function cardHref(
  cardSlug: string | null | undefined,
  cardId: string,
  fromSet?: { code: string; name: string },
): string {
  const base = `/cards/${cardSlug ?? cardId}`;
  if (!fromSet) return base;
  return `${base}?from=${fromSet.code}&fromName=${encodeURIComponent(fromSet.name)}`;
}
