import { createLogger } from "@mtg-au/shared";

export const logger = createLogger("web");

/** Format a number as an AUD price string, e.g. 4.5 → "$4.50" */
export function fmtAUD(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Format integer cents as an AUD price string, e.g. 450 → "$4.50" */
export function fmtCents(c: number): string {
  return fmtAUD(c / 100);
}

/** "1 card", "3 cards"; `many` for irregular plurals ("copies"). */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

export function cardHref(
  cardSlug: string | null | undefined,
  cardId: string,
  fromQuery?: string,
): string {
  const base = `/cards/${cardSlug ?? cardId}`;
  if (fromQuery) return `${base}?q=${encodeURIComponent(fromQuery)}`;
  return base;
}

/** Postage as listings show it: "free", an AUD amount, or "—" when the store doesn't say. */
export function fmtPostage(shippingAud: number | null): string {
  return shippingAud === null ? "—" : shippingAud === 0 ? "free" : fmtAUD(shippingAud);
}


/** Client-side cookie write, site-wide. `maxAge` 0 deletes it; omitted, it lasts the session. */
export function setCookie(name: string, value: string, maxAge?: number): void {
  document.cookie = `${name}=${value}; path=/;${maxAge === undefined ? "" : ` max-age=${maxAge};`} samesite=lax`;
}

export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

