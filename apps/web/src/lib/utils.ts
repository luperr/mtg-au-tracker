import { createLogger } from "@mtg-au/shared";

export const logger = createLogger("web");

/** Format a number as an AUD price string, e.g. 4.5 → "$4.50" */
export function fmtAUD(n: number): string {
  return `$${n.toFixed(2)}`;
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

/**
 * Convert a Scryfall "normal" image URI to its "small" variant.
 * Returns null if the input is null.
 */
export function toSmallImage(uri: string | null): string | null {
  return uri ? uri.replace("/normal/", "/small/") : null;
}

/** Client-side cookie write, site-wide. `maxAge` 0 deletes it; omitted, it lasts the session. */
export function setCookie(name: string, value: string, maxAge?: number): void {
  document.cookie = `${name}=${value}; path=/;${maxAge === undefined ? "" : ` max-age=${maxAge};`} samesite=lax`;
}

export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Fire an Umami analytics event. No-ops gracefully if Umami is absent. */
export function trackEvent(event: string, data?: Record<string, unknown>): void {
  window.umami?.track(event, data);
}

// ── Global type augmentation for Umami ───────────────────────────────────────
declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}
