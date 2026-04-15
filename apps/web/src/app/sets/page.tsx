export const revalidate = 3600;

import type { Metadata } from "next";
import { getSetList, getTopMovers } from "@/lib/db";
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
  const sets = await getSetList(showAll ? 20 : 2);

  const [movers7, movers14, movers30] = await Promise.all([
    getTopMovers(7),
    getTopMovers(14),
    getTopMovers(30),
  ]);

  return (
    <div className="max-w-4xl mx-auto">
      <MarketPulse movers7={movers7} movers14={movers14} movers30={movers30} />

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
