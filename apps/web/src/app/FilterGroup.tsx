"use client";

import { useState } from "react";
import { InfoTip } from "./InfoTip";

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
