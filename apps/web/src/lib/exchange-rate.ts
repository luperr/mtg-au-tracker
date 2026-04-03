import { getAudPerUsd as _getAudPerUsd } from "@mtg-au/shared";

/**
 * Web wrapper around the shared getAudPerUsd utility.
 * Passes Next.js fetch options so the Data Cache revalidates hourly,
 * avoiding a round-trip to Frankfurter on every card detail page render.
 */
export function getAudPerUsd(): Promise<number> {
  return _getAudPerUsd({ next: { revalidate: 3600 } } as RequestInit);
}
