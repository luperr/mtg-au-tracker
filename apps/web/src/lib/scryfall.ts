import { SCRYFALL_USER_AGENT } from "@/lib/config";

/**
 * A server-side fetch from Scryfall, with the User-Agent it requires — without one it answers
 * 400 "generic_user_agent". Times out rather than holding a request on a slow Scryfall.
 */
export function fetchScryfall(url: string, timeoutMs = 7000): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": SCRYFALL_USER_AGENT, Accept: "image/*,application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
}
