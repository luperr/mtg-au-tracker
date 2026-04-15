"use client";

import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import type { SetRarityBreakdown } from "@/lib/db";
import { fmtAUD } from "@/lib/utils";

const RARITY_STYLE: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  mythic: {
    label: "Mythic",
    color: "#b5642a",
    bg: "bg-orange-900/20",
    border: "border-orange-900/30",
  },
  rare: {
    label: "Rare",
    color: "#a8894a",
    bg: "bg-yellow-900/20",
    border: "border-yellow-900/30",
  },
  uncommon: {
    label: "Uncommon",
    color: "#8aa7b8",
    bg: "bg-blue-900/20",
    border: "border-blue-900/30",
  },
  common: {
    label: "Common",
    color: "#888888",
    bg: "bg-muted",
    border: "border-subtle",
  },
};

const tooltipStyle = {
  backgroundColor: "var(--color-surface, #1a1a1a)",
  border: "1px solid var(--color-subtle, #333)",
  borderRadius: 6,
  fontSize: 11,
  color: "var(--color-cream, #f0e8d8)",
};

export function RarityBreakdown({
  breakdown,
}: {
  breakdown: SetRarityBreakdown[];
}) {
  const totalValue = useMemo(
    () =>
      breakdown.reduce(
        (sum, r) => sum + (r.total_value ? parseFloat(r.total_value) : 0),
        0
      ),
    [breakdown]
  );

  const chartData = useMemo(
    () =>
      breakdown.map((r) => ({
        rarity: RARITY_STYLE[r.rarity]?.label ?? r.rarity,
        key: r.rarity,
        avg: r.avg_price ? parseFloat(r.avg_price) : 0,
        total: r.total_value ? parseFloat(r.total_value) : 0,
        count: r.card_count,
      })),
    [breakdown]
  );

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {breakdown.map((r) => {
          const style = RARITY_STYLE[r.rarity];
          if (!style) return null;
          const avg = r.avg_price ? parseFloat(r.avg_price) : null;
          const total = r.total_value ? parseFloat(r.total_value) : null;
          const pct = total != null && totalValue > 0 ? (total / totalValue) * 100 : 0;

          return (
            <div
              key={r.rarity}
              className={`rounded-lg border ${style.border} ${style.bg} px-3 py-2.5`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: style.color }}
                />
                <span className="text-[10px] uppercase tracking-wider text-cream-dim/60">
                  {style.label}
                </span>
              </div>
              <div className="text-base font-bold text-cream">
                {avg != null ? fmtAUD(avg) : "—"}
              </div>
              <div className="text-[10px] text-cream-dim/40 mt-0.5">
                avg · {r.card_count} card{r.card_count !== 1 ? "s" : ""}
              </div>
              <div className="text-[10px] text-cream-dim/50 mt-1">
                {pct.toFixed(0)}% of set value
              </div>
            </div>
          );
        })}
      </div>

      {/* Bar chart: average price by rarity */}
      <div className="rounded-lg border border-subtle bg-surface overflow-hidden">
        <div className="px-3 pt-3 pb-1 text-[10px] text-cream-dim/40 uppercase tracking-wider">
          Average price by rarity (AUD)
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 16, bottom: 4, left: -4 }}
          >
            <XAxis
              dataKey="rarity"
              tick={{ fill: "var(--color-cream-dim, #a09880)", fontSize: 10, opacity: 0.7 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(v) => `$${v.toFixed(0)}`}
              tick={{ fill: "var(--color-cream-dim, #a09880)", fontSize: 9, opacity: 0.6 }}
              tickLine={false}
              axisLine={false}
              width={34}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={((value: number) => [fmtAUD(value), "Avg price"]) as never}
            />
            <Bar dataKey="avg" radius={[3, 3, 0, 0]}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={RARITY_STYLE[entry.key]?.color ?? "#888"}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {totalValue > 0 && (
        <p className="text-[11px] text-cream-dim/40 leading-relaxed">
          Total in-stock value across all rarities: <strong className="text-cream-dim/70">{fmtAUD(totalValue)}</strong>.
          {breakdown.find((r) => r.rarity === "mythic") &&
          breakdown.find((r) => r.rarity === "rare") ? (
            <>
              {" "}
              Mythics average{" "}
              {fmtAUD(
                parseFloat(
                  breakdown.find((r) => r.rarity === "mythic")?.avg_price ?? "0"
                )
              )}{" "}
              vs{" "}
              {fmtAUD(
                parseFloat(
                  breakdown.find((r) => r.rarity === "rare")?.avg_price ?? "0"
                )
              )}{" "}
              for rares.
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
