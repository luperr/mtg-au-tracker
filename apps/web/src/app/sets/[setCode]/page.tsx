import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getSetMetadata,
  getSetPriceTimeline,
  getSetCardPerformance,
  getSetRarityBreakdown,
  getSetStoreComparison,
} from "@/lib/db";
import { SetDataStory } from "./SetDataStory";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ setCode: string }>;
}): Promise<Metadata> {
  const { setCode } = await params;
  const meta = await getSetMetadata(setCode);
  if (!meta) return { title: "Set Not Found | Scrymarket" };

  return {
    title: `${meta.set_name} Price Story | Scrymarket`,
    description: `Track ${meta.set_name} card prices across Australian stores. See winners, losers, and the full AU price story since release.`,
    openGraph: {
      title: `${meta.set_name} — AU Price Story`,
      description: `${meta.unique_cards} cards tracked across AU stores. See which cards spiked, which crashed, and the full market timeline.`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${meta.set_name} — AU Price Story | Scrymarket`,
      description: `${meta.unique_cards} cards. Full AU price data since release.`,
    },
  };
}

export default async function SetPage({
  params,
}: {
  params: Promise<{ setCode: string }>;
}) {
  const { setCode } = await params;

  const [meta, timeline, cardPerf, rarityBreakdown, storeComparison] =
    await Promise.all([
      getSetMetadata(setCode),
      getSetPriceTimeline(setCode),
      getSetCardPerformance(setCode),
      getSetRarityBreakdown(setCode),
      getSetStoreComparison(setCode),
    ]);

  if (!meta) notFound();

  return (
    <SetDataStory
      meta={meta!}
      timeline={timeline}
      cardPerf={cardPerf}
      rarityBreakdown={rarityBreakdown}
      storeComparison={storeComparison}
    />
  );
}
