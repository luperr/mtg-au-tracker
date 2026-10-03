"use client";

import { useState } from "react";
import { facetValueLabel, toggleFilter, FACET_TITLES, type FacetKey } from "@/lib/search-v2/params";
import type { FacetCount, Facets } from "@/lib/search-v2/types";
import { useSearchNav } from "./SearchNav";

/** Group order in the sidebar — most-used first. */
const GROUP_ORDER: FacetKey[] = ["stock", "store", "set", "rarity", "condition", "finish", "treatment"];

/**
 * Enum facets read best in their natural order; the rest (stores, sets) sort by
 * count as the query returns them.
 */
const FIXED_ORDER: Partial<Record<FacetKey, string[]>> = {
  stock: ["in", "out"],
  rarity: ["common", "uncommon", "rare", "mythic", "special", "bonus"],
  condition: ["NM", "LP", "MP", "HP", "DMG", "unknown"],
  finish: ["nonfoil", "foil", "etched"],
  treatment: ["normal", "borderless", "showcase", "extendedart", "retro", "fullart", "serialized"],
};

/** Long groups show this many options before "Show more". */
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
  const [expanded, setExpanded] = useState(false);
  const selected = state.filters[facetKey];
  const all = orderedOptions(facetKey, options, selected);
  if (all.length === 0) return null;

  const visible = expanded ? all : all.slice(0, COLLAPSED_LIMIT);

  return (
    <details open className="group border-b border-subtle py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-cream select-none">
        <span>
          {FACET_TITLES[facetKey]}
          {selected.length > 0 && <span className="ml-1.5 text-xs text-accent">({selected.length})</span>}
        </span>
        <span aria-hidden className="text-cream-dim/50 text-xs transition-transform group-open:rotate-90">›</span>
      </summary>

      <ul className="mt-2 flex flex-col gap-1">
        {visible.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <li key={o.value}>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-cream-dim hover:text-cream">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => navigate(toggleFilter(state, facetKey, o.value))}
                  className="accent-accent"
                />
                <span className={`flex-1 truncate ${checked ? "text-cream" : ""}`} title={o.label}>
                  {facetValueLabel(facetKey, o.value, o.label)}
                </span>
                <span className="text-xs tabular-nums text-cream-dim/50">{o.count.toLocaleString()}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {all.length > COLLAPSED_LIMIT && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1 text-xs text-accent hover:text-accent-light">
          {expanded ? "Show less" : `Show ${all.length - COLLAPSED_LIMIT} more`}
        </button>
      )}
    </details>
  );
}

/**
 * Filter groups with counts. Each group's counts apply every active filter except
 * its own (see searchListings()), so ticking a second store shows what it adds
 * rather than collapsing to the first one's results.
 */
export function FilterSidebar({ facets }: { facets: Facets }) {
  return (
    <div className="flex flex-col">
      {GROUP_ORDER.map((key) => <FacetGroup key={key} facetKey={key} options={facets[key]} />)}
    </div>
  );
}
