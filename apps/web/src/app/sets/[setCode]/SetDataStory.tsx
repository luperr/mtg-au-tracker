"use client";

import type {
  SetMetadata,
  SetPriceTimelinePoint,
  SetCardPerf,
  SetRarityBreakdown,
  SetStoreComparison,
} from "@/lib/db";
import { SetHero } from "./SetHero";
import { CrashCurveChart } from "./CrashCurveChart";
import { WinnersLosersBoard } from "./WinnersLosersBoard";
import { RarityBreakdown } from "./RarityBreakdown";
import { StoreComparison } from "./StoreComparison";
import { SetCardExplorer } from "./SetCardExplorer";

interface SetDataStoryProps {
  meta: SetMetadata;
  timeline: SetPriceTimelinePoint[];
  cardPerf: SetCardPerf[];
  rarityBreakdown: SetRarityBreakdown[];
  storeComparison: SetStoreComparison[];
}

export function SetDataStory({
  meta,
  timeline,
  cardPerf,
  rarityBreakdown,
  storeComparison,
}: SetDataStoryProps) {
  const hasHistory = timeline.length >= 2;
  const hasPerf = cardPerf.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* ── 1. Hero ──────────────────────────────────────────────────────── */}
      <SetHero meta={meta} timeline={timeline} />

      {/* ── 2. The Crash Curve ───────────────────────────────────────────── */}
      {hasHistory && (
        <section>
          <SectionHeader
            title="The Price Story"
            subtitle="Total market value of all cards in the set over time"
          />
          <CrashCurveChart timeline={timeline} />
        </section>
      )}

      {/* ── 3. Winners & Losers ──────────────────────────────────────────── */}
      {hasPerf && (
        <section>
          <SectionHeader
            title="Winners & Losers"
            subtitle="Price change from first recorded price to today (non-foil)"
          />
          <WinnersLosersBoard cardPerf={cardPerf} setCode={meta.set_code} />
        </section>
      )}

      {/* ── 4. Rarity Breakdown ──────────────────────────────────────────── */}
      {rarityBreakdown.length > 0 && (
        <section>
          <SectionHeader
            title="Value by Rarity"
            subtitle="How set value is distributed across rarities"
          />
          <RarityBreakdown breakdown={rarityBreakdown} />
        </section>
      )}

      {/* ── 5. Store Comparison ──────────────────────────────────────────── */}
      {storeComparison.length > 0 && (
        <section>
          <SectionHeader
            title="Store Coverage"
            subtitle={`Which AU stores are stocking ${meta.set_name}`}
          />
          <StoreComparison stores={storeComparison} totalCards={meta.unique_cards} />
        </section>
      )}

      {/* ── 6. Full Card Explorer ────────────────────────────────────────── */}
      {hasPerf && (
        <section>
          <SectionHeader
            title="All Cards"
            subtitle="Browse every card in the set with current prices"
          />
          <SetCardExplorer cardPerf={cardPerf} setCode={meta.set_code} />
        </section>
      )}

      {/* Empty state */}
      {!hasHistory && !hasPerf && (
        <div className="rounded-xl border border-subtle bg-surface p-10 text-center">
          <div className="text-3xl mb-3">📊</div>
          <div className="font-medium text-cream mb-1">Price data building…</div>
          <div className="text-sm text-cream-dim/50">
            Price history for {meta.set_name} will appear after AU stores are scraped.
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-cream">{title}</h2>
      <p className="text-xs text-cream-dim/50 mt-0.5">{subtitle}</p>
    </div>
  );
}
