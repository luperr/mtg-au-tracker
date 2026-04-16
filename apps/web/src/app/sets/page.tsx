export const revalidate = 3600;

import type { Metadata } from "next";
import { getSetList, getTopMovers } from "@/lib/db";
// getTopMovers imported for 7d initial load only; 14d/30d are lazy-fetched client-side
import { SetsListClient } from "./SetsListClient";
import { MarketPulse } from "./MarketPulse";

export const metadata: Metadata = {
  title: "Set Releases | Scrymarket",
  description: "Browse MTG set releases and track price movements across Australian stores.",
};

export default async function SetsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const { all } = await searchParams;
  const showAll = all === "1";
  const [sets, movers7] = await Promise.all([
    getSetList(showAll ? 20 : 2),
    getTopMovers(7),
  ]);

  return (
    <div className="max-w-4xl mx-auto">
      <MarketPulse initialMovers={movers7} />

      {sets.length === 0 ? (
        <div className="text-center py-16 text-cream-dim/40 text-sm">
          No sets found. Check back after the next scrape run.
        </div>
      ) : (
        <SetsListClient sets={sets} showAll={showAll} />
      )}
    </div>
  );
}
