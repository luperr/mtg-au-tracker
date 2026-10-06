"use client";

import { useState } from "react";
import { OptionItem, pillClass } from "@/app/Dropdown";
import {
  activeFilterCount, clearFilters, facetValueLabel, parsePrice, priceFilterApplies, setPrice, toggleFilter,
  FACET_TITLES, type FacetKey,
} from "@/lib/search-v2/params";
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
  treatment: ["borderless", "showcase", "extendedart", "retro", "fullart", "serialized"],
};

const INPUT_CLASS = "w-full min-w-0 rounded-lg border border-subtle bg-muted px-2.5 py-1 text-xs text-cream placeholder:text-cream-dim/40 focus:border-accent focus:outline-none";

/** Long groups show this many options before "Show more", and get a search box. */
const COLLAPSED_LIMIT = 8;

/**
 * `pinned` floats to the top of count-sorted groups, so ticked stores and sets don't
 * sit buried under "Show more". Fixed-order groups are short enough to see whole,
 * and keep their natural order.
 */
function orderedOptions(key: FacetKey, options: FacetCount[], selected: string[], pinned: string[]): FacetCount[] {
  // A selected value can drop out of its own facet's rows when the *other* filters
  // leave it no listings — keep it visible at 0 so it can still be unticked.
  const missing = selected
    .filter((v) => !options.some((o) => o.value === v))
    .map((value) => ({ value, label: value, count: 0 }));
  const all = [...options, ...missing];

  const order = FIXED_ORDER[key];
  if (!order) return [...all].sort((a, b) => Number(pinned.includes(b.value)) - Number(pinned.includes(a.value)));
  const rank = (v: string) => (order.includes(v) ? order.indexOf(v) : order.length);
  return [...all].sort((a, b) => rank(a.value) - rank(b.value));
}

/** A collapsible sidebar section. `active` is how many of its filters are set. */
function Group({
  title, active, defaultOpen = true, children,
}: {
  title: string;
  active: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || active > 0);
  return (
    <section>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-cream hover:bg-muted/40 transition-colors"
      >
        <span>
          {title}
          {active > 0 && <span className="ml-1.5 text-xs text-accent-light">({active})</span>}
        </span>
        <span aria-hidden className="text-[9px] text-cream-dim/50">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </section>
  );
}

/** "Clear" for the sidebar and drawer headers — nothing when no filter is set. */
export function ClearFiltersButton() {
  const { state, navigate } = useSearchNav();
  if (activeFilterCount(state) === 0) return null;
  return (
    <button onClick={() => navigate(clearFilters(state))} className="px-1.5 text-[11px] text-cream-dim/60 hover:text-cream transition-colors">
      Clear
    </button>
  );
}

/**
 * Min/max price. Collapsed by default — it's an occasional filter — and only offered
 * in printing and listing views, where a tile is one listing's price. Keyed on the
 * range by its parent, so Clear, back or a remembered filter remounts it fresh.
 */
function PriceGroup() {
  const { state, navigate } = useSearchNav();
  const [min, setMin] = useState(state.price.min?.toString() ?? "");
  const [max, setMax] = useState(state.price.max?.toString() ?? "");

  function apply(e: React.FormEvent) {
    e.preventDefault();
    navigate(setPrice(state, { min: parsePrice(min), max: parsePrice(max) }));
  }

  return (
    <Group title="Price" active={priceFilterApplies(state) ? 1 : 0} defaultOpen={false}>
      <form onSubmit={apply} className="flex items-center gap-1.5 px-3">
        <input type="number" inputMode="decimal" min={0} step="0.01" value={min} onChange={(e) => setMin(e.target.value)}
          placeholder="Min $" aria-label="Minimum price" className={INPUT_CLASS} />
        <span className="text-cream-dim/40 text-xs">–</span>
        <input type="number" inputMode="decimal" min={0} step="0.01" value={max} onChange={(e) => setMax(e.target.value)}
          placeholder="Max $" aria-label="Maximum price" className={INPUT_CLASS} />
        <button type="submit" className={pillClass(false, "rounded-lg")}>Go</button>
      </form>
    </Group>
  );
}

function FacetGroup({ facetKey, options }: { facetKey: FacetKey; options: FacetCount[] }) {
  const { state, rendered, navigate } = useSearchNav();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const selected = state.filters[facetKey];
  // Pin by the rendered selection, not the optimistic one — otherwise a row would
  // jump out from under the cursor while ticking several in a row.
  const all = orderedOptions(facetKey, options, selected, rendered.filters[facetKey]);
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
    <Group title={FACET_TITLES[facetKey]} active={selected.length}>
          {searchable && (
            <div className="px-3 pb-1.5">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${FACET_TITLES[facetKey].toLowerCase()}s…`}
                aria-label={`Search ${FACET_TITLES[facetKey].toLowerCase()} filters`}
                className={INPUT_CLASS}
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
    </Group>
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
  const { state } = useSearchNav();
  return (
    <div className={`flex flex-col divide-y divide-subtle/60 ${framed ? "rounded-lg border border-subtle bg-surface overflow-hidden" : ""}`}>
      {GROUP_ORDER.map((key) => <FacetGroup key={key} facetKey={key} options={facets[key]} />)}
      {state.view !== "card" && <PriceGroup key={`${state.price.min}:${state.price.max}`} />}
    </div>
  );
}
