"use client";

import React, { createContext, useContext, useMemo } from "react";
import type { AffiliateConfig } from "@/lib/affiliate";
import { EBAY_AFFILIATE_ROTATION_ID_DEFAULT } from "@/lib/config";

const AffiliateContext = createContext<AffiliateConfig>({
  campaignId: null,
  rotationId: EBAY_AFFILIATE_ROTATION_ID_DEFAULT,
});

/**
 * Carries affiliate config from the server (where the runtime env lives) down to
 * client components that render outbound links. Mounted once in the root layout.
 */
export function AffiliateProvider({
  campaignId,
  rotationId,
  children,
}: AffiliateConfig & { children: React.ReactNode }) {
  const value = useMemo(() => ({ campaignId, rotationId }), [campaignId, rotationId]);
  return <AffiliateContext.Provider value={value}>{children}</AffiliateContext.Provider>;
}

export function useAffiliate(): AffiliateConfig {
  return useContext(AffiliateContext);
}
