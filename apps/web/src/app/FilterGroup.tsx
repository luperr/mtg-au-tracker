"use client";

import { useState } from "react";
import { InfoTip } from "./InfoTip";
import { pillClass } from "./Dropdown";

/** The phone "Filters (n)" button that opens a filter drawer — search and the want list share it. */
export function filtersButtonClass(active: boolean): string {
  return `${pillClass(active)} min-h-9`;
}

/** "Clear" in a filter drawer's header (and the search sidebar's). */
export const FILTER_CLEAR_CLASS = "px-1.5 py-2 text-[11px] text-cream-dim/60 hover:text-cream transition-colors";

/** A folded section's summary of what's picked: "Any", the labels if one or two, else "3 selected". */
export function selectionSummary(labels: string[]): string {
  if (labels.length === 0) return "Any";
  return labels.length <= 2 ? labels.join(", ") : `${labels.length} selected`;
}

/**
 * A collapsible filter section — the search sidebar's groups and the want list's filter
 * drawer. `active` is how many of its filters are set. `summary` shows the current value
 * beside the title, so a folded section still says what it's set to; `info` puts a note
 * behind an ⓘ instead of in the body.
 */
export function FilterGroup({
  title, active, summary, info, defaultOpen = true, openIfActive = true, children,
}: {
  title: string;
  active: number;
  summary?: string;
  info?: string;
  defaultOpen?: boolean;
  /** Start open whenever a filter in it is set, whatever `defaultOpen` says. */
  openIfActive?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || (openIfActive && active > 0));
  return (
    <section>
      {/* The whole row toggles; the title button carries the state for assistive tech. */}
      <div onClick={() => setOpen(!open)} className="flex cursor-pointer items-center gap-1 pr-2 hover:bg-muted/40 transition-colors">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          aria-expanded={open}
          className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm font-medium text-cream"
        >
          {title}
          {active > 0 && <span className="ml-1.5 text-xs text-accent-light">({active})</span>}
        </button>
        {summary && <span className="shrink-0 truncate text-xs text-cream-dim">{summary}</span>}
        {info && <InfoTip text={info} label={`About ${title}`} />}
        <span aria-hidden className="w-4 shrink-0 text-center text-[9px] text-cream-dim/50">{open ? "▲" : "▼"}</span>
      </div>
      {open && <div className="pb-2">{children}</div>}
    </section>
  );
}
