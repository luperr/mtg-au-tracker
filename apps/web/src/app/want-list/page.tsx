import type { Metadata } from "next";
import { WantListView } from "./WantListView";

export const metadata: Metadata = {
  title: "Want List — Scrymarket",
  description: "Your MTG card want list with AUD prices",
};

export default function WantListPage() {
  return <WantListView />;
}
