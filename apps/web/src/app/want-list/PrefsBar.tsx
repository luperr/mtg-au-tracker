"use client";

import { Dropdown, OptionItem, pillClass } from "@/app/Dropdown";
import { Sheet } from "@/app/Sheet";
import { FilterGroup } from "@/app/FilterGroup";
import { CONDITIONS, type SavedPrefs } from "@/lib/optimiser/want-list";
import { useEffect, useState, type ReactNode } from "react";
import type { SetFamily } from "@/lib/set-families";
import type { StoreSummary } from "@/lib/store-shipping";
import { MAX_STORES_CAP } from "@/lib/config";

type Condition = SavedPrefs["conditions"][number];
type OnChange = (patch: Partial<SavedPrefs>, pref: string) => void;

const CONDITION_LABELS: Record<Condition, string> = {
  NM: "Near mint",
  LP: "Lightly played",
  MP: "Moderately played",
  HP: "Heavily played",
  DMG: "Damaged",
};

const UNSTATED_NOTE = "Listings that don’t state a condition are included, and flagged.";
const EBAY_NOTE = "eBay listings aren’t counted — untick eBay under Buy from to leave them out.";

/** Preferences changed from their defaults — the count on the phone's Filters button. */
export function activePrefCount(prefs: SavedPrefs): number {
  const conditionsDefault = prefs.conditions.length === 1 && prefs.conditions[0] === "NM";
  return (conditionsDefault ? 0 : 1) + (prefs.maxStores === null ? 0 : 1) + (prefs.excludeStores.length > 0 ? 1 : 0)
    + (prefs.excludeSets.length > 0 ? 1 : 0);
}

/**
 * Every set family, fetched once per page and shared by the pills and the drawer. A failed
 * fetch isn't kept, so opening the picker again retries.
 */
let setFamilies: Promise<SetFamily[] | null> | null = null;

function loadSetFamilies(): Promise<SetFamily[] | null> {
  if (!setFamilies) {
    setFamilies = fetch("/api/sets")
      .then((r) => {
        if (!r.ok) throw new Error(`sets ${r.status}`);
        return r.json() as Promise<SetFamily[]>;
      })
      .catch(() => {
        setFamilies = null;
        return null;
      });
  }
  return setFamilies;
}

/** Shown before anything is typed: the newest sets, where a reprint you'd rather skip usually lives. */
const NEWEST_SHOWN = 20;

/** The set families, loaded when `load` first turns true (a picker opens, or some are already excluded). */
function useSetFamilies(load: boolean): { families: SetFamily[] | null; failed: boolean } {
  const [families, setFamiliesState] = useState<SetFamily[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!load || families) return;
    let live = true;
    setFailed(false);
    loadSetFamilies().then((f) => {
      if (!live) return;
      if (f) setFamiliesState(f);
      else setFailed(true);
    });
    return () => { live = false; };
  }, [load, families]);
  return { families, failed };
}

/** "None", or how many set families are excluded — the label beside the picker. */
function excludedSetsLabel(prefs: SavedPrefs, families: SetFamily[] | null): string {
  if (prefs.excludeSets.length === 0) return "None";
  if (!families) return "Some";
  const n = families.filter((f) => prefs.excludeSets.includes(f.code)).length;
  return n === 1 ? families.find((f) => prefs.excludeSets.includes(f.code))!.code.toUpperCase() : `${n} sets`;
}

/** Search box plus set checklist: excluded sets pinned first, then matches (or the newest). */
function SetOptions({ c, families, failed, scroll }: {
  c: Controls;
  families: SetFamily[] | null;
  failed: boolean;
  scroll: boolean;
}) {
  const [query, setQuery] = useState("");
  if (failed) return <p className="px-3 py-2 text-xs text-cream-dim">Couldn’t load sets — close this and try again.</p>;
  if (!families) return <p className="px-3 py-2 text-xs text-cream-dim">Loading sets…</p>;

  const q = query.trim().toLowerCase();
  const excluded = families.filter((f) => c.isSetExcluded(f));
  const rest = families.filter((f) => !c.isSetExcluded(f));
  const shown = q
    ? rest.filter((f) => f.name.toLowerCase().includes(q) || f.codes.some((code) => code.startsWith(q)))
    : rest.slice(0, NEWEST_SHOWN);

  return (
    <>
      <div className="px-3 pt-1 pb-1.5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${families.length} sets`}
          aria-label="Search sets to exclude"
          className="w-full min-w-0 rounded-lg border border-subtle bg-muted px-2.5 py-2 sm:py-1 text-xs text-cream placeholder:text-cream-dim/40 focus:border-accent focus:outline-none"
        />
      </div>
      <div className={scroll ? "max-h-72 overflow-y-auto" : ""}>
        {[...excluded, ...shown].map((f) => (
          <OptionItem
            key={f.code}
            type="check"
            label={f.name}
            checked={c.isSetExcluded(f)}
            onClick={() => c.toggleSetFamily(f)}
            trailing={<span className="text-[11px] uppercase text-cream-dim/50">{f.code}</span>}
          />
        ))}
        {shown.length === 0 && q && <p className="px-3 py-2 text-xs text-cream-dim">No set matches “{query}”.</p>}
      </div>
    </>
  );
}

/** The picker loads sets when it's shown — the dropdown and the drawer section only render it open. */
function SetPicker({ c, scroll }: { c: Controls; scroll: boolean }) {
  const { families, failed } = useSetFamilies(true);
  return <SetOptions c={c} families={families} failed={failed} scroll={scroll} />;
}

const SETS_NOTE = "Ticked sets, and their commander, promo and token sets, are never picked for a card set to any printing. A card locked to a printing keeps it.";

/**
 * The rules behind the preference controls, shared by the desktop pills and the phone drawer.
 *
 * Condition is a checklist of the conditions to buy (NM by default; at least one stays ticked).
 * Stores is a checklist with everything ticked — eBay included — and unticking one leaves it
 * out; it's stored as the unticked ids, so a new store starts ticked.
 *
 * Max stores is "All" (no limit) or a number from 1 up to the ticked flat-rate stores, capped
 * at what the optimiser accepts (per-item stores like eBay aren't counted, as the optimiser
 * doesn't). All sits below 1: + from All gives 1, − from 1 gives All.
 */
function usePrefsControls(prefs: SavedPrefs, stores: StoreSummary[], onChange: OnChange) {
  const chosen = new Set(prefs.conditions);
  const excluded = new Set(prefs.excludeStores);
  // Per-item stores (eBay) last: a marketplace, not one shop.
  const storeList = [...stores.filter((s) => !s.perItem), ...stores.filter((s) => s.perItem)];
  const unticked = storeList.filter((s) => excluded.has(s.id)).length;
  const available = Math.min(storeList.filter((s) => !s.perItem && !excluded.has(s.id)).length, MAX_STORES_CAP);
  const max = prefs.maxStores;

  function setMax(n: number | null) {
    const valid = n !== null && Number.isFinite(n) && n >= 1;
    onChange({ maxStores: valid ? Math.min(Math.floor(n), Math.max(available, 1)) : null }, "max-stores");
  }

  return {
    chosen, excluded, storeList, unticked, available, max, setMax,
    conditionLabel: chosen.size === CONDITIONS.length
      ? "Condition: any"
      : `Condition: ${CONDITIONS.filter((c) => chosen.has(c)).join(", ")}`,
    storesLabel: unticked === 0 ? "Buy from: all stores" : `Buy from: ${storeList.length - unticked} of ${storeList.length} stores`,
    toggleCondition(c: Condition) {
      if (chosen.has(c) && chosen.size === 1) return; // at least one stays ticked
      const next = new Set(chosen);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      onChange({ conditions: CONDITIONS.filter((x) => next.has(x)) }, "condition");
    },
    toggleStore(id: string) {
      const next = new Set(excluded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange({ excludeStores: [...next] }, "stores");
    },
    /** A family counts as excluded by its main set's code; toggling adds or drops all its codes. */
    isSetExcluded: (f: SetFamily) => prefs.excludeSets.includes(f.code),
    toggleSetFamily(f: SetFamily) {
      const codes = new Set(prefs.excludeSets);
      const on = !codes.has(f.code);
      for (const code of f.codes) {
        if (on) codes.add(code);
        else codes.delete(code);
      }
      onChange({ excludeSets: [...codes] }, "sets");
    },
    selectAllStores: () => onChange({ excludeStores: [] }, "stores"),
    clearStores: () => onChange({ excludeStores: storeList.map((s) => s.id) }, "stores"),
  };
}

type Controls = ReturnType<typeof usePrefsControls>;

/** `note`: the unstated-condition note inline (desktop); the drawer puts it behind an ⓘ. */
function ConditionOptions({ c, note }: { c: Controls; note: boolean }) {
  return (
    <>
      {CONDITIONS.map((x) => (
        <OptionItem key={x} type="check" label={`${CONDITION_LABELS[x]} (${x})`} checked={c.chosen.has(x)} onClick={() => c.toggleCondition(x)} />
      ))}
      {note && <p className="px-3 pt-1 pb-2 text-xs text-cream-dim">{UNSTATED_NOTE}</p>}
    </>
  );
}

function StoreOptions({ c, scroll }: { c: Controls; scroll: boolean }) {
  return (
    <>
      <div className="flex gap-3 border-b border-subtle px-3 py-2 text-xs">
        <button onClick={c.selectAllStores} className="text-accent-light hover:underline">Select all</button>
        <button onClick={c.clearStores} className="text-cream-dim hover:underline">Clear</button>
      </div>
      <div className={scroll ? "max-h-72 overflow-y-auto" : ""}>
        {c.storeList.map((s) => (
          <OptionItem key={s.id} type="check" label={s.name} checked={!c.excluded.has(s.id)} onClick={() => c.toggleStore(s.id)} />
        ))}
      </div>
    </>
  );
}

/** All · − · n · + — compact in the desktop pill, thumb-sized in the drawer. */
function MaxStoresStepper({ c, large }: { c: Controls; large: boolean }) {
  const btn = `flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 ${large ? "h-10 w-10 text-lg" : "h-6 w-6 text-sm"}`;
  return (
    <>
      <button onClick={() => c.setMax(c.max === null || c.max <= 1 ? null : c.max - 1)} disabled={c.max === null} aria-label="Fewer stores" className={btn}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={c.available}
        value={c.max ?? ""}
        placeholder="All"
        onChange={(e) => c.setMax(e.target.value === "" ? null : Number(e.target.value))}
        aria-label="Max stores (empty for all)"
        className={`${large ? "w-[5ch] text-base" : "w-[4ch]"} bg-transparent text-center tabular-nums text-cream placeholder:text-cream [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
      />
      <button onClick={() => c.setMax(c.max === null ? 1 : c.max + 1)} disabled={c.max !== null && c.max >= c.available} aria-label="More stores" className={btn}>
        +
      </button>
    </>
  );
}

/** sm and up: the optimiser's preferences as the search filter pills, with the list actions at the end. */
export function PrefsBar({
  prefs, stores, onChange, children,
}: {
  prefs: SavedPrefs;
  stores: StoreSummary[];
  onChange: OnChange;
  /** List actions shown at the end of the row (Unlock all, Clear all). */
  children?: ReactNode;
}) {
  const c = usePrefsControls(prefs, stores, onChange);
  // Only needed up front to name what's already excluded.
  const { families } = useSetFamilies(prefs.excludeSets.length > 0);

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Optimiser preferences">
      <Dropdown label={c.conditionLabel} active={activePrefCount({ ...prefs, maxStores: null, excludeStores: [] }) > 0}>
        <ConditionOptions c={c} note />
      </Dropdown>

      <div
        className={`flex items-center gap-1 !py-1 ${pillClass(c.max !== null, "rounded-lg")}`}
        role="group"
        aria-label="Maximum number of stores"
        title={EBAY_NOTE}
      >
        <button onClick={() => c.setMax(null)} title="Reset to All" aria-label="Max stores — reset to All" className="hover:underline">
          Max stores
        </button>
        <MaxStoresStepper c={c} large={false} />
      </div>

      <Dropdown label={c.storesLabel} active={c.unticked > 0}>
        <StoreOptions c={c} scroll />
      </Dropdown>

      <Dropdown label={`Exclude sets: ${excludedSetsLabel(prefs, families)}`} active={prefs.excludeSets.length > 0}>
        <SetPicker c={c} scroll />
        <p className="px-3 pt-1 pb-2 text-xs text-cream-dim">{SETS_NOTE}</p>
      </Dropdown>

      {children && <div className="ml-auto flex shrink-0 items-center gap-4 pl-2">{children}</div>}
    </div>
  );
}

/**
 * Phones: the same preferences in a "Filters" drawer, opened from one button — the search
 * page's filter pattern. Each one folds away, showing its current value; notes sit behind ⓘ.
 */
export function PrefsSheet({
  open, onClose, prefs, stores, onChange,
}: {
  open: boolean;
  onClose: () => void;
  prefs: SavedPrefs;
  stores: StoreSummary[];
  onChange: OnChange;
}) {
  const c = usePrefsControls(prefs, stores, onChange);
  const conditionsSet = activePrefCount({ ...prefs, maxStores: null, excludeStores: [] });
  const conditionSummary = c.chosen.size === CONDITIONS.length ? "Any" : CONDITIONS.filter((x) => c.chosen.has(x)).join(", ");
  const storesSummary = c.unticked === 0 ? "All" : `${c.storeList.length - c.unticked} of ${c.storeList.length}`;
  const { families } = useSetFamilies(prefs.excludeSets.length > 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="left"
      title="Filters"
      className="sm:hidden"
      footer={<button onClick={onClose} className="flex h-11 w-full items-center justify-center rounded-lg bg-cta font-medium text-cream">Done</button>}
    >
      <div className="divide-y divide-subtle/60">
        <FilterGroup title="Condition" active={conditionsSet} summary={conditionSummary} info={UNSTATED_NOTE} defaultOpen={false} openIfActive={false}>
          <ConditionOptions c={c} note={false} />
        </FilterGroup>

        <FilterGroup title="Max stores" active={c.max === null ? 0 : 1} summary={c.max === null ? "All" : String(c.max)} info={EBAY_NOTE} defaultOpen={false} openIfActive={false}>
          <div className="flex items-center gap-2 px-3">
            <MaxStoresStepper c={c} large />
            <button onClick={() => c.setMax(null)} disabled={c.max === null} className="ml-auto py-2 text-sm text-accent-light disabled:text-cream-dim/40">
              All stores
            </button>
          </div>
        </FilterGroup>

        <FilterGroup title="Buy from" active={c.unticked > 0 ? 1 : 0} summary={storesSummary} defaultOpen={false} openIfActive={false}>
          <StoreOptions c={c} scroll={false} />
        </FilterGroup>

        <FilterGroup
          title="Exclude sets"
          active={prefs.excludeSets.length > 0 ? 1 : 0}
          summary={excludedSetsLabel(prefs, families)}
          info={SETS_NOTE}
          defaultOpen={false}
          openIfActive={false}
        >
          <SetPicker c={c} scroll={false} />
        </FilterGroup>
      </div>
    </Sheet>
  );
}
