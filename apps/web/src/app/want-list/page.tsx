import type { Metadata } from "next";
import { cookies } from "next/headers";
import { WantListView } from "./WantListView";
import { WantListV2 } from "./v2/WantListV2";
import { OptimiserV2Toggle } from "./OptimiserV2Toggle";
import { getEnabledStores, getStoreShippingRates } from "@/lib/store-shipping";
import { optimiserV2Default } from "@/lib/config";
import { OPTIMISER_V2_COOKIE, optimiserV2Enabled } from "@/lib/optimiser/flag";

// The want list is inherently per-user (localStorage-backed) and now fetches
// shipping rates from the DB — force dynamic rendering so `next build` doesn't
// try to statically prerender it (which needs a live DB connection the build
// stage doesn't have).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Want List — Scrymarket",
  description: "Your MTG card want list with AUD prices",
};

export default async function WantListPage() {
  // Beta: the optimiser_v2 cookie, or OPTIMISER_V2_DEFAULT when the user hasn't chosen.
  const v2 = optimiserV2Enabled((await cookies()).get(OPTIMISER_V2_COOKIE)?.value, optimiserV2Default());
  if (v2) {
    return <WantListV2 stores={await getEnabledStores()} toggle={<OptimiserV2Toggle on />} />;
  }
  const storeShippingAud = await getStoreShippingRates();
  return <WantListView storeShippingAud={storeShippingAud} toggle={<OptimiserV2Toggle on={false} />} />;
}
