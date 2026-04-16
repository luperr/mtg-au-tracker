"use client";

import { useState, useRef, useEffect } from "react";
import type { TopMover } from "@/lib/db";
import { cardHref } from "@/lib/utils";
import { CardThumb } from "@/app/CardThumb";

type Window = 7 | 14 | 30;

function fmtAUD(n: number) {
  return `$${n.toFixed(2)}`;
}

function MoverRow({ m, rank }: { m: TopMover; rank: number }) {
  const pct = parseFloat(m.pct_change);
  const from = parseFloat(m.start_price);
  const to = parseFloat(m.current_price);
  const isUp = m.direction === "up";

  return (
    <a
      href={cardHref(m.slug, m.card_id, { code: m.set_code, name: m.set_name })}
      className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors rounded-lg"
    >
      <span className="text-[11px] font-bold text-cream-dim/25 w-4 shrink-0 text-center">
        {rank}
      </span>

      <CardThumb imageUri={m.image_uri} alt={m.name} className="w-8 h-11" />

      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-cream truncate group-hover:text-accent transition-colors">
          {m.name}
        </div>
        <div className="text-[10px] text-cream-dim/40 truncate">{m.set_name}</div>
      </div>

      <div className="text-right shrink-0">
        <div className={`text-sm font-black tabular-nums ${isUp ? "text-green-400" : "text-red-400"}`}>
          {isUp ? "+" : ""}{pct.toFixed(0)}%
        </div>
        <div className="text-[10px] text-cream-dim/40 tabular-nums">
          {fmtAUD(from)} → {fmtAUD(to)}
        </div>
      </div>
    </a>
  );
}

function Leaderboard({ movers, direction }: { movers: TopMover[]; direction: "up" | "down" }) {
  if (movers.length === 0) return null;
  const isUp = direction === "up";

  return (
    <div className="flex-1 min-w-0 rounded-xl border border-subtle bg-surface overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-subtle ${
        isUp ? "bg-green-950/30" : "bg-red-950/30"
      }`}>
        <span className={`text-xs font-bold ${isUp ? "text-green-400" : "text-red-400"}`}>
          {isUp ? "▲" : "▼"}
        </span>
        <span className="text-[11px] font-semibold text-cream uppercase tracking-wider">
          {isUp ? "Biggest Gains" : "Biggest Drops"}
        </span>
      </div>
      <div className="py-1 divide-y divide-subtle/20">
        {movers.map((m, i) => (
          <MoverRow key={m.card_id} m={m} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

function WindowToggle({ value, onChange, loading }: { value: Window; onChange: (w: Window) => void; loading: boolean }) {
  const options: Window[] = [7, 14, 30];
  return (
    <div className="flex items-center rounded-md border border-subtle overflow-hidden">
      {options.map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          disabled={loading}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === w
              ? "bg-accent/20 text-accent"
              : "text-cream-dim/40 hover:text-cream-dim hover:bg-muted"
          }`}
        >
          {w}d
        </button>
      ))}
    </div>
  );
}

export function MarketPulse({ initialMovers }: { initialMovers: TopMover[] }) {
  const [window, setWindow] = useState<Window>(7);
  const [loading, setLoading] = useState(false);
  const cache = useRef<Partial<Record<Window, TopMover[]>>>({ 7: initialMovers });

  useEffect(() => {
    // Prefetch 14d and 30d in the background on mount
    for (const w of [14, 30] as const) {
      if (cache.current[w]) continue;
      fetch(`/api/top-movers?days=${w}`)
        .then((r) => r.json())
        .then((data: TopMover[]) => { cache.current[w] = data; })
        .catch(() => { /* silently ignore — user sees loading state if they switch */ });
    }
  }, []);

  async function handleWindowChange(w: Window) {
    setWindow(w);
    if (cache.current[w]) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/top-movers?days=${w}`);
      const data: TopMover[] = await res.json();
      cache.current[w] = data;
    } finally {
      setLoading(false);
    }
  }

  const movers: TopMover[] = cache.current[window] ?? [];
  const up = movers.filter((m) => m.direction === "up");
  const down = movers.filter((m) => m.direction === "down");
  const hasData = up.length > 0 || down.length > 0;

  return (
    <div className="rounded-xl border border-subtle bg-surface p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-cream">Big movers</h1>
        </div>
        <WindowToggle value={window} onChange={handleWindowChange} loading={loading} />
      </div>

      {loading ? (
        <div className="py-4 text-center text-cream-dim/40 text-sm">Loading…</div>
      ) : !hasData ? (
        <p className="text-sm text-cream-dim/40 py-2">
          Not enough price history yet — check back after a few scrape runs.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <Leaderboard movers={up} direction="up" />
          <Leaderboard movers={down} direction="down" />
        </div>
      )}
    </div>
  );
}
