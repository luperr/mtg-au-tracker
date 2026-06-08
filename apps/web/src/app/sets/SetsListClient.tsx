"use client";

import { useState } from "react";
import { SetSymbol } from "@/app/SetSymbol";
import { ViewToggle, type ViewMode } from "@/app/ViewToggle";
import type { SetSummary } from "@/lib/db";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    month: "short",
    year: "numeric",
  });
}

function isNew(dateStr: string, days = 60) {
  return Date.now() - new Date(dateStr).getTime() < days * 86_400_000;
}

function isUpcoming(dateStr: string) {
  return new Date(dateStr).getTime() > Date.now();
}

const CHILD_TYPE_LABEL: Record<string, string> = {
  commander:       "Commander",
  promo:           "Promo",
  memorabilia:     "Secret Lair",
  box:             "Box Toppers",
  draft_innovation:"Bonus Sheet",
  masters:         "Masters",
};

function SubsetBadges({ childTypes }: { childTypes: string | null }) {
  if (!childTypes) return null;
  const labels = childTypes
    .split(",")
    .map((t) => CHILD_TYPE_LABEL[t])
    .filter(Boolean);
  if (labels.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {labels.map((label) => (
        <span
          key={label}
          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-accent/20 text-accent/60 bg-accent-muted/30"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function SetCardMedium({ set }: { set: SetSummary }) {
  const fresh = isNew(set.released_at);
  const value = set.set_value_aud ? parseFloat(set.set_value_aud) : null;

  return (
    <a
      href={`/sets/${set.set_code}`}
      className="group relative block rounded-lg border border-subtle bg-surface p-4 hover:border-accent-border hover:bg-accent-muted transition-colors"
    >
      {isUpcoming(set.released_at) ? (
        <span className="absolute top-3 right-3 text-[9px] uppercase tracking-widest font-semibold text-accent bg-accent-muted border border-accent/30 rounded px-1.5 py-0.5">
          Upcoming
        </span>
      ) : fresh && (
        <span className="absolute top-3 right-3 text-[9px] uppercase tracking-widest font-semibold text-accent bg-accent-muted border border-accent/30 rounded px-1.5 py-0.5">
          New
        </span>
      )}

      <div className="flex items-start gap-3">
        <SetSymbol
          setCode={set.set_code}
          setName={set.set_name}
          size={32}
          className="shrink-0 mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity"
        />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-cream text-sm leading-tight truncate pr-8">
            {set.set_name}
          </div>
          <div className="text-[11px] text-cream-dim/50 mt-0.5 uppercase tracking-wide">
            {set.set_code} · {formatDate(set.released_at)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-[10px] text-cream-dim/40 uppercase tracking-wider">Set value</div>
          <div className="text-lg font-bold text-price">
            {value != null ? `$${value.toFixed(0)}` : "—"}
            {value != null && <span className="text-[10px] text-cream-dim/40 font-normal ml-1">AUD</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-cream-dim/40 uppercase tracking-wider">Cards</div>
          <div className="text-sm font-semibold text-cream-dim">{set.card_count}</div>
        </div>
      </div>

      <SubsetBadges childTypes={set.child_types} />
    </a>
  );
}

function SetRowCompact({ set }: { set: SetSummary }) {
  const fresh = isNew(set.released_at);
  const value = set.set_value_aud ? parseFloat(set.set_value_aud) : null;
  const childLabels = set.child_types
    ? set.child_types.split(",").map((t) => CHILD_TYPE_LABEL[t]).filter(Boolean)
    : [];

  return (
    <a
      href={`/sets/${set.set_code}`}
      className="group flex items-center gap-3 px-3 py-2 rounded-lg border border-subtle bg-surface hover:border-accent-border hover:bg-accent-muted transition-colors"
    >
      <SetSymbol
        setCode={set.set_code}
        setName={set.set_name}
        size={20}
        className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
      />
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <span className="text-sm font-medium text-cream truncate">{set.set_name}</span>
        {isUpcoming(set.released_at) ? (
          <span className="text-[8px] uppercase tracking-widest font-semibold text-accent border border-accent/30 rounded px-1 py-0.5 shrink-0">
            Upcoming
          </span>
        ) : fresh && (
          <span className="text-[8px] uppercase tracking-widest font-semibold text-accent border border-accent/30 rounded px-1 py-0.5 shrink-0">
            New
          </span>
        )}
      </div>
      <div className="text-[11px] text-cream-dim/40 uppercase tracking-wide shrink-0 hidden sm:block">
        {set.set_code}
      </div>
      <div className="text-[11px] text-cream-dim/40 shrink-0 hidden md:block w-16 text-right">
        {formatDate(set.released_at)}
      </div>
      {childLabels.length > 0 && (
        <div className="hidden lg:flex gap-1 shrink-0">
          {childLabels.slice(0, 2).map((label) => (
            <span
              key={label}
              className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-accent/20 text-accent/60 bg-accent-muted/30"
            >
              {label}
            </span>
          ))}
          {childLabels.length > 2 && (
            <span className="text-[9px] text-cream-dim/30">+{childLabels.length - 2}</span>
          )}
        </div>
      )}
      <div className="text-sm font-semibold text-price shrink-0 w-16 text-right">
        {value != null ? `$${value.toFixed(0)}` : "—"}
      </div>
      <div className="text-xs text-cream-dim/40 shrink-0 w-8 text-right">
        {set.card_count}
      </div>
    </a>
  );
}

export function SetsListClient({
  sets,
  showAll,
}: {
  sets: SetSummary[];
  showAll: boolean;
}) {
  const [view, setView] = useState<ViewMode>("medium");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-cream-dim/60">
          {showAll
            ? `${sets.length} sets — click any set for AU price data`
            : `${sets.length} sets from the last 2 years — click for AU price data`}
        </p>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === "medium" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((set) => (
            <SetCardMedium key={set.set_code} set={set} />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 px-3 pb-1 text-[10px] text-cream-dim/30 uppercase tracking-wider">
            <div className="w-5 shrink-0" />
            <div className="flex-1">Set</div>
            <div className="hidden sm:block w-10 text-right">Code</div>
            <div className="hidden md:block w-16 text-right">Released</div>
            <div className="hidden lg:block w-auto text-right">Subsets</div>
            <div className="w-16 text-right">Value</div>
            <div className="w-8 text-right">Cards</div>
          </div>
          {sets.map((set) => (
            <SetRowCompact key={set.set_code} set={set} />
          ))}
        </div>
      )}

      {!showAll && (
        <div className="mt-6 text-center">
          <a
            href="/sets?all=1"
            className="text-sm text-cream-dim/50 hover:text-cream-dim transition-colors border border-subtle rounded-lg px-4 py-2 inline-block hover:border-accent/40"
          >
            Show older sets
          </a>
        </div>
      )}
    </div>
  );
}
