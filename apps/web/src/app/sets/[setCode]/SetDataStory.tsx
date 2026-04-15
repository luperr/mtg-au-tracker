"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import type {
  SetMetadata,
  SetPriceTimelinePoint,
  SetCardPerf,
  SetRarityBreakdown,
  SetReprintCard,
  ChildSet,
} from "@/lib/db";
import { SetHero } from "./SetHero";
import { CrashCurveChart } from "./CrashCurveChart";
import { WinnersLosersBoard } from "./WinnersLosersBoard";
import { SetCardExplorer } from "./SetCardExplorer";
import { ReprintImpact } from "./ReprintImpact";

const SET_TYPE_LABEL: Record<string, string> = {
  commander: "Commander",
  promo: "Promo",
  memorabilia: "Secret Lair",
  token: "Tokens",
  box: "Box Set",
  draft_innovation: "Draft Innovation",
  masters: "Masters",
  expansion: "Expansion",
  core: "Core",
  starter: "Starter",
  funny: "Acorn",
};

interface SetDataStoryProps {
  meta: SetMetadata;
  timeline: SetPriceTimelinePoint[];
  cardPerf: SetCardPerf[];
  rarityBreakdown: SetRarityBreakdown[];
  reprintCards: SetReprintCard[];
  childSets: ChildSet[];
  activeSubsets: string[];
}

export function SetDataStory({
  meta,
  timeline,
  cardPerf,
  rarityBreakdown,
  reprintCards,
  childSets,
  activeSubsets,
}: SetDataStoryProps) {
  const hasHistory = timeline.length >= 2;
  const hasPerf = cardPerf.length > 0;

  // Rarity filter — lifted here so hero Mythics button can control it
  const [rarityFilter, setRarityFilter] = useState<string>("all");

  const router = useRouter();
  const pathname = usePathname();

  // Subset toggle — opt-out from the default (all non-token children included).
  // When resulting set equals the full default, navigate to clean URL.
  function toggleSubset(code: string) {
    const next = new Set(activeSubsets);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
    }
    // If all non-token children are still selected → clean URL (default state)
    const isDefault = childSets.every((cs) => next.has(cs.set_code));
    if (isDefault) {
      router.push(pathname);
    } else {
      // ?subsets= with empty string means "no subsets" (just main set)
      router.push(`${pathname}?subsets=${[...next].join(",")}`);
    }
  }

  function scrollToAllCards() {
    document.getElementById("all-cards")?.scrollIntoView({ behavior: "smooth" });
  }

  const handleCardsClick = useCallback(() => {
    scrollToAllCards();
  }, []);

  const handleMythicsClick = useCallback(() => {
    setRarityFilter("mythic");
    // Small delay so the filter state has time to apply before scrolling
    setTimeout(scrollToAllCards, 50);
  }, []);

  const handleReprintsClick = useCallback(() => {
    document.getElementById("reprint-impact")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* ── 1. Hero ──────────────────────────────────────────────────────── */}
      <SetHero
        meta={meta}
        timeline={timeline}
        reprintCount={reprintCards.length}
        onCardsClick={handleCardsClick}
        onMythicsClick={handleMythicsClick}
        onReprintsClick={reprintCards.length > 0 ? handleReprintsClick : undefined}
      />

      {/* ── Subset filter ────────────────────────────────────────────────── */}
      {childSets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 -mt-6">
          <span className="text-[10px] text-cream-dim/40 uppercase tracking-wider">
            Includes
          </span>
          {childSets.map((cs) => {
            const included = activeSubsets.includes(cs.set_code);
            const label = cs.set_type ? (SET_TYPE_LABEL[cs.set_type] ?? cs.set_name) : cs.set_name;
            return (
              <button
                key={cs.set_code}
                onClick={() => toggleSubset(cs.set_code)}
                title={`${included ? "Exclude" : "Include"} ${cs.set_name}`}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium border transition-colors ${
                  included
                    ? "bg-accent-muted text-accent-light border-accent-border"
                    : "bg-muted text-cream-dim/30 border-subtle line-through hover:text-cream-dim/50"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── 2. The Price Story (with rarity overlay) ─────────────────────── */}
      {hasHistory && (
        <section>
          <SectionHeader
            title="AU Market Breakdown"
            subtitle="Total market value of all cards in the set over time"
          />
          <CrashCurveChart timeline={timeline} rarityBreakdown={rarityBreakdown} />
        </section>
      )}

      {/* ── 3. Winners & Losers ──────────────────────────────────────────── */}
      {hasPerf && (
        <section>
          <SectionHeader
            title="Winners & Losers"
            subtitle="Price change from first recorded price to today (non-foil)"
          />
          <WinnersLosersBoard cardPerf={cardPerf} setCode={meta.set_code} setName={meta.set_name} />
        </section>
      )}

      {/* ── 4. Reprint Impact ────────────────────────────────────────────── */}
      {reprintCards.length > 0 && (
        <section id="reprint-impact">
          <SectionHeader
            title="Reprint Impact"
            subtitle="How this set's reprints compare to other printings in stock"
          />
          <ReprintImpact cards={reprintCards} setCode={meta.set_code} setName={meta.set_name} />
        </section>
      )}

      {/* ── 6. Full Card Explorer ────────────────────────────────────────── */}
      {hasPerf && (
        <section>
          <SectionHeader
            title="All Cards"
            subtitle="Browse every card in the set with current prices"
          />
          <SetCardExplorer
            cardPerf={cardPerf}
            setCode={meta.set_code}
            setName={meta.set_name}
            rarityFilter={rarityFilter}
            onRarityFilterChange={setRarityFilter}
          />
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

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-cream">{title}</h2>
      <p className="text-xs text-cream-dim/50 mt-0.5">{subtitle}</p>
    </div>
  );
}
