"use client";

import Script from "next/script";
import { ANALYTICS_DOMAINS, ANALYTICS_SCRIPT_URL, ANALYTICS_WEBSITE_ID } from "@/lib/config";
import { flushQueue } from "@/lib/analytics";

/**
 * Loads the Umami tracker. A client component only so `onLoad` can flush the events
 * fired before the script arrived — see `track()` in `lib/analytics.ts`.
 */
export function Analytics() {
  return (
    <Script
      src={ANALYTICS_SCRIPT_URL}
      data-website-id={ANALYTICS_WEBSITE_ID}
      data-domains={ANALYTICS_DOMAINS}
      strategy="afterInteractive"
      onLoad={flushQueue}
    />
  );
}
