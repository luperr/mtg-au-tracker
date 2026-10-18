import { useEffect, useState } from "react";
import { setCookie, ONE_YEAR_SECONDS } from "@/lib/utils";
import { searchV2Enabled, SEARCH_V2_COOKIE } from "./params";

/** Fired on `window` whenever setSearchV2() runs, so every switch on the page agrees. */
const SEARCH_V2_EVENT = "search-v2-change";

/** Always an explicit "1" or "0", so an opt-out survives the default being flipped later. */
export function setSearchV2(on: boolean): void {
  setCookie(SEARCH_V2_COOKIE, on ? "1" : "0", ONE_YEAR_SECONDS);
  window.dispatchEvent(new Event(SEARCH_V2_EVENT));
}

function readCookie(): string | undefined {
  return document.cookie.split("; ").find((c) => c.startsWith(`${SEARCH_V2_COOKIE}=`))?.split("=")[1];
}

/**
 * Whether v2 is on, kept in sync across components: the header toggle and the landing
 * notice both flip it, and each has to see the other's change without a remount.
 * `defaultOn` is what applies when the cookie is absent.
 */
export function useSearchV2(defaultOn: boolean): boolean {
  const [on, setOn] = useState(defaultOn);

  useEffect(() => {
    const sync = () => setOn(searchV2Enabled(readCookie(), defaultOn));
    sync();
    window.addEventListener(SEARCH_V2_EVENT, sync);
    return () => window.removeEventListener(SEARCH_V2_EVENT, sync);
  }, [defaultOn]);

  return on;
}
