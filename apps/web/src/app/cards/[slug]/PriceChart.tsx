"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { CardPriceHistory } from "@/lib/db";
import { fmtAUD } from "@/lib/utils";

const LINE_COLORS = [
  "#7eb8d4", // blue
  "#c4a35a", // gold
  "#a07cc5", // purple
  "#5ab8a0", // teal
  "#d4846a", // orange
  "#8ab87e", // green
  "#c46f9a", // pink
  "#8899cc", // indigo
  "#e8c547", // yellow
  "#70b8e8", // sky
  "#d47080", // rose
  "#60c870", // lime
  "#e890b0", // magenta
  "#90d0b8", // mint
  "#b8a060", // bronze
  "#a8c0e0", // periwinkle
];

const MAX_SERIES = 16;

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}


function mergeBySet(bySet: CardPriceHistory["bySet"]) {
  const allDates = new Set<string>();
  for (const p of bySet) for (const d of p.data) allDates.add(d.date);
  const sorted = Array.from(allDates).sort();
  return sorted.map((date) => {
    const point: Record<string, string | number> = { date };
    for (const p of bySet) {
      const match = p.data.find((d) => d.date === date);
      if (match) point[p.setCode] = match.price;
    }
    return point;
  });
}

const tooltipStyle = {
  backgroundColor: "var(--color-surface, #201f1d)",
  border: "1px solid var(--color-subtle, #3d3a33)",
  borderRadius: 6,
  fontSize: 11,
  color: "var(--color-cream, #E8DECE)",
};
const tickStyle = { fill: "var(--color-cream-dim, #a89d8a)", fontSize: 9, opacity: 0.6 };

export function PriceChart({ history }: { history: CardPriceHistory }) {
  const [view, setView] = useState<"aggregate" | "printing">("aggregate");

  const hasHistory = history.aggregate.length >= 2;
  const topSets = useMemo(
    () =>
      [...history.bySet]
        .sort((a, b) => b.data.length - a.data.length)
        .slice(0, MAX_SERIES),
    [history.bySet]
  );
  const hasSetHistory = topSets.length >= 1;

  const mergedSetData = useMemo(() => mergeBySet(topSets), [topSets]);

  const yDomain = useMemo(() => {
    const allPrices =
      view === "aggregate"
        ? history.aggregate.map((d) => d.price)
        : topSets.flatMap((p) => p.data.map((d) => d.price));
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    const pad = (max - min) * 0.15 || 1;
    return [Math.max(0, min - pad), max + pad] as [number, number];
  }, [view, history, topSets]);

  if (!hasHistory) {
    return (
      <div className="mt-8 rounded-lg border border-subtle bg-surface px-3 py-4 text-center text-[11px] text-cream-dim/40">
        Price history building…
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-cream-dim/60 uppercase tracking-wider">Price History</span>
        {hasSetHistory && <div className="flex gap-1">
          {(["aggregate", "printing"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 rounded text-[10px] py-1.5 px-3 min-h-[36px] transition-colors ${
                view === v
                  ? "bg-accent-muted text-accent-light border border-accent-border"
                  : "bg-muted text-cream-dim/50 border border-subtle hover:text-cream-dim"
              }`}
            >
              {v === "aggregate" ? "Overall" : "By set"}
            </button>
          ))}
        </div>}
      </div>

      <div className="rounded-lg border border-subtle bg-surface overflow-hidden">
        <ResponsiveContainer width="100%" height={220}>
          {view === "aggregate" ? (
            <AreaChart data={history.aggregate} margin={{ top: 10, right: 8, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7eb8d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7eb8d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={formatDate} tick={tickStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={yDomain} tickFormatter={(v) => `$${v.toFixed(0)}`} tick={tickStyle} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} formatter={((value: number) => [fmtAUD(value || 0), "Price"]) as never} labelFormatter={formatDate as never} />
              <Area type="monotone" dataKey="price" stroke="#7eb8d4" strokeWidth={1.5} fill="url(#priceGrad)" dot={false} />
            </AreaChart>
          ) : (
            <LineChart data={mergedSetData} margin={{ top: 10, right: 8, bottom: 0, left: -10 }}>
              <XAxis dataKey="date" tickFormatter={formatDate} tick={tickStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={yDomain} tickFormatter={(v) => `$${v.toFixed(0)}`} tick={tickStyle} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={((value: number, _name: string, props: { dataKey: string }) => {
                  const p = topSets.find((p) => p.setCode === props.dataKey);
                  return [fmtAUD(value || 0), p ? p.setName : props.dataKey];
                }) as never}
                labelFormatter={formatDate as never}
              />
              {topSets.map((p, i) => (
                <Line key={p.setCode} type="monotone" dataKey={p.setCode} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={1.5} dot={false} connectNulls />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>

        {/* Custom legend for by-printing view */}
        {view === "printing" && (
          <div className="px-3 pb-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {topSets.map((p, i) => (
              <div key={p.setCode} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
                <span className="text-[9px] text-cream-dim/60 truncate max-w-[80px]">
                  {p.setName}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
