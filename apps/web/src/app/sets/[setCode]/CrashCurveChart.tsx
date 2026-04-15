"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { SetPriceTimelinePoint } from "@/lib/db";
import { fmtAUD } from "@/lib/utils";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

const tooltipStyle = {
  backgroundColor: "var(--color-surface, #1a1a1a)",
  border: "1px solid var(--color-subtle, #333)",
  borderRadius: 6,
  fontSize: 11,
  color: "var(--color-cream, #f0e8d8)",
};
const tickStyle = {
  fill: "var(--color-cream-dim, #a09880)",
  fontSize: 9,
  opacity: 0.6,
};

interface InsightStats {
  peakValue: number;
  peakDate: string;
  currentValue: number;
  firstValue: number;
  totalChangePct: number;
  weekOneSaved: number | null;
}

function computeInsights(timeline: SetPriceTimelinePoint[]): InsightStats | null {
  if (timeline.length < 2) return null;

  const values = timeline.map((t) => parseFloat(t.total_value));
  const firstValue = values[0];
  const currentValue = values[values.length - 1];
  const peakValue = Math.max(...values);
  const peakIdx = values.indexOf(peakValue);
  const peakDate = timeline[peakIdx].date;
  const totalChangePct = firstValue > 0 ? ((currentValue - firstValue) / firstValue) * 100 : 0;

  // "Waited 6 weeks" saving: compare week 1 average vs week 6 value
  let weekOneSaved: number | null = null;
  if (timeline.length >= 42) {
    const week6Value = values[41]; // ~6 weeks of daily data
    weekOneSaved = firstValue - week6Value;
  }

  return { peakValue, peakDate, currentValue, firstValue, totalChangePct, weekOneSaved };
}

export function CrashCurveChart({
  timeline,
}: {
  timeline: SetPriceTimelinePoint[];
}) {
  const chartData = useMemo(
    () => timeline.map((t) => ({ date: t.date, value: parseFloat(t.total_value) })),
    [timeline]
  );

  const insights = useMemo(() => computeInsights(timeline), [timeline]);

  const yDomain = useMemo(() => {
    const values = chartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.12 || 10;
    return [Math.max(0, min - pad), max + pad] as [number, number];
  }, [chartData]);

  const crashed = insights && insights.totalChangePct < -5;
  const stable = insights && Math.abs(insights.totalChangePct) <= 5;

  return (
    <div className="space-y-4">
      {/* Insight callout */}
      {insights && (
        <div className="rounded-lg border border-subtle bg-surface px-4 py-3 flex flex-wrap gap-4 text-sm">
          <Stat
            label="Release value"
            value={fmtAUD(insights.firstValue)}
          />
          <Stat
            label="Current value"
            value={fmtAUD(insights.currentValue)}
            highlight
          />
          <Stat
            label="Change"
            value={`${insights.totalChangePct > 0 ? "+" : ""}${insights.totalChangePct.toFixed(1)}%`}
            color={
              insights.totalChangePct < -5
                ? "text-green-400"
                : insights.totalChangePct > 5
                ? "text-red-400"
                : "text-cream-dim"
            }
          />
          {insights.weekOneSaved != null && insights.weekOneSaved > 0 && (
            <Stat
              label="Saved by waiting 6 weeks"
              value={fmtAUD(insights.weekOneSaved)}
              color="text-green-400"
            />
          )}
        </div>
      )}

      {/* Narrative caption */}
      {insights && (
        <p className="text-[11px] text-cream-dim/50 leading-relaxed">
          {crashed
            ? `Total set value has dropped ${Math.abs(insights.totalChangePct).toFixed(0)}% since release — the typical new-set depreciation curve as hype gives way to supply.`
            : stable
            ? `Prices have held relatively steady since release, suggesting strong demand matching supply.`
            : `Set value has risen ${insights.totalChangePct.toFixed(0)}% since release — unusual for a new set.`}
          {insights.weekOneSaved != null && insights.weekOneSaved > 1
            ? ` Buyers who waited just 6 weeks saved ~${fmtAUD(insights.weekOneSaved)} on a full set.`
            : null}
        </p>
      )}

      {/* Chart */}
      <div className="rounded-lg border border-subtle bg-surface overflow-hidden">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -4 }}>
            <defs>
              <linearGradient id="crashGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FD8B51" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#FD8B51" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={60}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(v) => `$${(v / 1000).toFixed(v >= 1000 ? 1 : 0)}${v >= 1000 ? "k" : ""}`}
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={((value: number) => [fmtAUD(value), "Set value"]) as never}
              labelFormatter={formatDate as never}
            />
            {/* Reference line at release (day 1) */}
            {chartData.length > 0 && (
              <ReferenceLine
                x={chartData[0].date}
                stroke="var(--color-subtle, #3d3a33)"
                strokeDasharray="3 3"
                label={{
                  value: "Release",
                  position: "insideTopRight",
                  fontSize: 9,
                  fill: "var(--color-cream-dim, #a89d8a)",
                  opacity: 0.6,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke="#FD8B51"
              strokeWidth={1.5}
              fill="url(#crashGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* X-axis label */}
      {timeline.length > 0 && (
        <div className="flex justify-between text-[10px] text-cream-dim/30 px-1">
          <span>{formatDate(timeline[0].date)}</span>
          <span>{formatDate(timeline[timeline.length - 1].date)}</span>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  color,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  color?: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-cream-dim/40 uppercase tracking-wider">{label}</div>
      <div className={`font-semibold ${highlight ? "text-price" : (color ?? "text-cream")}`}>
        {value}
      </div>
    </div>
  );
}
