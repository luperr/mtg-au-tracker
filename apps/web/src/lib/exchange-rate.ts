import { getAudPerUsd as _getAudPerUsd } from "@mtg-au/shared";
import { CACHE_REVALIDATE_HOUR } from "./config.js";

/**
 * Web wrapper around the shared getAudPerUsd utility.
 * Passes Next.js fetch options so the Data Cache revalidates hourly,
 * avoiding a round-trip to Frankfurter on every card detail page render.
 */
export function getAudPerUsd(): Promise<number> {
  return _getAudPerUsd({ next: { revalidate: CACHE_REVALIDATE_HOUR } } as RequestInit);
}
