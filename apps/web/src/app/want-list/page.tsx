import type { Metadata } from "next";
import { WantListView } from "./WantListView";
import { getStoreShippingRates } from "@/lib/store-shipping";

export const metadata: Metadata = {
  title: "Want List — Scrymarket",
  description: "Your MTG card want list with AUD prices",
};

export default async function WantListPage() {
  const storeShippingAud = await getStoreShippingRates();
  return <WantListView storeShippingAud={storeShippingAud} />;
}
