"use client";

import { trackEvent } from "@/lib/utils";
import { applyAffiliateParams, buildCustomId } from "@/lib/affiliate";
import { useAffiliate } from "@/app/AffiliateContext";

interface BuyLinkProps {
  href: string;
  storeId: string;
  card: string;
  price: number;
  /** Identifies which part of the UI fired the click (used in analytics). */
  source: string;
  /** Printing being linked to — feeds the affiliate `customid` for per-card attribution. */
  printingId?: string;
  className?: string;
}

/**
 * Renders an outbound store buy link.
 *
 * Responsibilities:
 *  - Opens in a new tab with correct rel attributes
 *  - Fires a `store-click` Umami custom event on every click
 *  - Single place to add affiliate URL rewriting (see @/lib/affiliate)
 */
export function BuyLink({ href, storeId, card, price, source, printingId, className }: BuyLinkProps) {
  const { campaignId, rotationId } = useAffiliate();
  const resolvedHref = applyAffiliateParams(href, storeId, {
    campaignId,
    rotationId,
    customId: buildCustomId(source, printingId),
  });

  return (
    <a
      href={resolvedHref}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-price hover:text-cream text-sm transition-colors"}
      onClick={() => trackEvent("store-click", { store: storeId, card, price, source })}
    >
      Buy ↗
    </a>
  );
}
