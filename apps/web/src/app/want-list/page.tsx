import type { Metadata } from "next";
import { WantListView } from "./WantListView";
import { getStoreShippingRates } from "@/lib/store-shipping";

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
  const storeShippingAud = await getStoreShippingRates();
  return <WantListView storeShippingAud={storeShippingAud} />;
}
