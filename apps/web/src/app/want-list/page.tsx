import type { Metadata } from "next";
import { WantListView } from "./WantListView";
import { getEnabledStores, getStoreShippingRates } from "@/lib/store-shipping";

// The want list is inherently per-user (localStorage-backed) and reads the store
// list from the DB — force dynamic rendering so `next build` doesn't try to
// statically prerender it (which needs a live DB connection the build stage
// doesn't have).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Want List — Scrymarket",
  description: "Your MTG card want list, and the cheapest way to buy it across Australian stores",
};

export default async function WantListPage() {
  const [stores, rates] = await Promise.all([getEnabledStores(), getStoreShippingRates()]);
  return <WantListView stores={stores} rates={rates} />;
}
