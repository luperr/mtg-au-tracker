"use client";

import { useState } from "react";
import { OptionItem } from "@/app/Dropdown";
import { facetValueLabel, toggleFilter, FACET_TITLES, type FacetKey } from "@/lib/search-v2/params";
import type { FacetCount, Facets } from "@/lib/search-v2/types";
import { useSearchNav } from "./SearchNav";

/** Group order in the sidebar — most-used first. */
const GROUP_ORDER: FacetKey[] = ["store", "set", "condition", "finish", "treatment"];

/**
 * Enum facets read best in their natural order; the rest (stores, sets) sort by
 * count as the query returns them.
 */
const FIXED_ORDER: Partial<Record<FacetKey, string[]>> = {
  condition: ["NM", "LP", "MP", "HP", "DMG", "unknown"],
  finish: ["nonfoil", "foil", "etched"],
  treatment: ["normal", "borderless", "showcase", "extendedart", "retro", "fullart", "serialized"],
};

/** Long groups show this many options before "Show more", and get a search box. */
const COLLAPSED_LIMIT = 8;

function orderedOptions(key: FacetKey, options: FacetCount[], selected: string[]): FacetCount[] {
  // A selected value can drop out of its own facet's rows when the *other* filters
  // leave it no listings — keep it visible at 0 so it can still be unticked.
  const missing = selected
    .filter((v) => !options.some((o) => o.value === v))
    .map((value) => ({ value, label: value, count: 0 }));
  const all = [...options, ...missing];

  const order = FIXED_ORDER[key];
  if (!order) return all;
  const rank = (v: string) => (order.includes(v) ? order.indexOf(v) : order.length);
  return [...all].sort((a, b) => rank(a.value) - rank(b.value));
}

function FacetGroup({ facetKey, options }: { facetKey: FacetKey; options: FacetCount[] }) {
  const { state, navigate } = useSearchNav();
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const selected = state.filters[facetKey];
  const all = orderedOptions(facetKey, options, selected);
  if (all.length === 0) return null;

  const searchable = all.length > COLLAPSED_LIMIT;
  const needle = search.trim().toLowerCase();
  // Match the value too, so a set code ("mh3") finds its set. Ticked options stay
  // visible whatever is typed, so a search never hides what is filtering the results.
  const matches = needle
    ? all.filter((o) =>
        selected.includes(o.value) ||
        facetValueLabel(facetKey, o.value, o.label).toLowerCase().includes(needle) ||
        o.value.toLowerCase().includes(needle))
    : all;
  const visible = needle || expanded ? matches : matches.slice(0, COLLAPSED_LIMIT);

  return (
    <section>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-cream hover:bg-muted/40 transition-colors"
      >
        <span>
          {FACET_TITLES[facetKey]}
          {selected.length > 0 && <span className="ml-1.5 text-xs text-accent-light">({selected.length})</span>}
        </span>
        <span aria-hidden className="text-[9px] text-cream-dim/50">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="pb-2">
          {searchable && (
            <div className="px-3 pb-1.5">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${FACET_TITLES[facetKey].toLowerCase()}s…`}
                aria-label={`Search ${FACET_TITLES[facetKey].toLowerCase()} filters`}
                className="w-full rounded-lg border border-subtle bg-muted px-2.5 py-1 text-xs text-cream placeholder:text-cream-dim/40 focus:border-accent focus:outline-none"
              />
            </div>
          )}

          {visible.map((o) => (
            <OptionItem
              key={o.value}
              type="check"
              label={facetValueLabel(facetKey, o.value, o.label)}
              checked={selected.includes(o.value)}
              onClick={() => navigate(toggleFilter(state, facetKey, o.value))}
              trailing={<span className="text-xs tabular-nums text-cream-dim/50">{o.count.toLocaleString()}</span>}
            />
          ))}

          {needle && matches.length === 0 && (
            <p className="px-3 py-1 text-xs text-cream-dim/50">No matches</p>
          )}

          {!needle && all.length > COLLAPSED_LIMIT && (
            <button onClick={() => setExpanded(!expanded)} className="px-3 pt-1 text-xs text-accent-light hover:text-cream transition-colors">
              {expanded ? "Show less" : `Show ${all.length - COLLAPSED_LIMIT} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Filter groups with counts. Each group's counts apply every active filter except
 * its own (see searchListings()), so ticking a second store shows what it adds
 * rather than collapsing to the first one's results.
 *
 * Framed like the card page's price list. `framed={false}` inside the mobile
 * drawer, which is already the frame.
 */
export function FilterSidebar({ facets, framed = true }: { facets: Facets; framed?: boolean }) {
  return (
    <div className={`flex flex-col divide-y divide-subtle/60 ${framed ? "rounded-lg border border-subtle bg-surface overflow-hidden" : ""}`}>
      {GROUP_ORDER.map((key) => <FacetGroup key={key} facetKey={key} options={facets[key]} />)}
    </div>
  );
}
