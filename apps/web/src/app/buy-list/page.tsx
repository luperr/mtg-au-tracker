import type { Metadata } from "next";
import { BuyListView } from "./BuyListView";

export const metadata: Metadata = {
  title: "Buy List — Scrymarket",
  description: "Your MTG card buy list with AUD prices",
};

export default function BuyListPage() {
  return <BuyListView />;
}
