import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getSetMetadata,
  getSetPriceTimeline,
  getSetCardPerformance,
  getSetRarityBreakdown,
  getSetReprintCards,
  getChildSets,
} from "@/lib/db";
import { SetDataStory } from "./SetDataStory";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ setCode: string }>;
}): Promise<Metadata> {
  const { setCode } = await params;
  const meta = await getSetMetadata(setCode);
  if (!meta) return { title: "Set Not Found | Scrymarket" };

  return {
    title: `${meta.set_name} — AU Market Breakdown | Scrymarket`,
    description: `Track ${meta.set_name} card prices across Australian stores. See winners, losers, and the full AU market breakdown since release.`,
    openGraph: {
      title: `${meta.set_name} — AU Market Breakdown`,
      description: `${meta.unique_cards} cards tracked across AU stores. See which cards spiked, which crashed, and the full market timeline.`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${meta.set_name} — AU Market Breakdown | Scrymarket`,
      description: `${meta.unique_cards} cards. Full AU price data since release.`,
    },
  };
}

export default async function SetPage({
  params,
  searchParams,
}: {
  params: Promise<{ setCode: string }>;
  searchParams: Promise<{ subsets?: string }>;
}) {
  const { setCode } = await params;
  const { subsets: subsetsParam } = await searchParams;

  const [meta, allChildSets] = await Promise.all([
    getSetMetadata(setCode),
    getChildSets(setCode),
  ]);
  if (!meta) notFound();

  // Tokens are never included in data or shown in the toggle UI
  const childSets = allChildSets.filter((s) => s.set_type !== "token");
  const validChildCodes = new Set(childSets.map((s) => s.set_code));

  // Default: include ALL non-token children.
  // When ?subsets param is present, use that explicit list (empty string = none).
  let activeSubsets: string[];
  if (subsetsParam === undefined) {
    activeSubsets = childSets.map((s) => s.set_code);
  } else {
    activeSubsets = subsetsParam
      ? subsetsParam.split(",").filter((c) => validChildCodes.has(c))
      : [];
  }
  const allSetCodes = [setCode, ...activeSubsets];

  const [timeline, cardPerf, rarityBreakdown, reprintCards] =
    await Promise.all([
      getSetPriceTimeline(allSetCodes),
      getSetCardPerformance(allSetCodes),
      getSetRarityBreakdown(allSetCodes),
      getSetReprintCards(setCode),
    ]);

  return (
    <SetDataStory
      meta={meta}
      timeline={timeline}
      cardPerf={cardPerf}
      rarityBreakdown={rarityBreakdown}
      reprintCards={reprintCards}
      childSets={childSets}
      activeSubsets={activeSubsets}
    />
  );
}
