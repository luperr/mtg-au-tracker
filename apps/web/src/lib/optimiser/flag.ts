// The optimiser v2 beta flag. Its own module so the server page can read it
// without importing anything client-side.

export const OPTIMISER_V2_COOKIE = "optimiser_v2";

/** Whether /want-list renders v2: an explicit choice in the cookie wins, otherwise the default. */
export function optimiserV2Enabled(cookie: string | undefined, defaultOn: boolean): boolean {
  return cookie === "1" || (cookie !== "0" && defaultOn);
}
