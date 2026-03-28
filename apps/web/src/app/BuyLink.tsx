"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface BuyLinkProps {
  href: string;
  store: string;
  card: string;
  price: number;
  /** Identifies which part of the UI fired the click (used in analytics). */
  source: string;
  className?: string;
}

/**
 * Renders an outbound store buy link.
 *
 * Responsibilities:
 *  - Opens in a new tab with correct rel attributes
 *  - Fires a `store-click` Umami custom event on every click
 *  - Single place to add affiliate URL rewriting in future
 */
export function BuyLink({ href, store, card, price, source, className }: BuyLinkProps) {
  const resolvedHref = applyAffiliateParams(href, store);

  return (
    <a
      href={resolvedHref}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-price hover:text-cream text-sm transition-colors"}
      onClick={() =>
        (window as any).umami?.track("store-click", { store, card, price, source })
      }
    >
      Buy ↗
    </a>
  );
}

/**
 * Transform a store URL to include affiliate parameters where applicable.
 * Extend this function as affiliate deals are set up — no call-sites need changing.
 */
function applyAffiliateParams(url: string, _store: string): string {
  // Example (uncomment and adapt when a deal is in place):
  // if (_store === "mtgmate") {
  //   const u = new URL(url);
  //   u.searchParams.set("ref", "scrymarket");
  //   return u.toString();
  // }
  return url;
}
