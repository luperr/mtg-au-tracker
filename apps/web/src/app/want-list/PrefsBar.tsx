"use client";

import { Dropdown, OptionItem, pillClass } from "@/app/Dropdown";
import type { SavedPrefs } from "@/lib/optimiser/want-list";
import type { StoreSummary } from "@/lib/store-shipping";

const CONDITIONS: { value: SavedPrefs["minCondition"]; label: string; short: string }[] = [
  { value: "NM", label: "Near mint only", short: "NM" },
  { value: "LP", label: "Lightly played or better", short: "LP+" },
  { value: "MP", label: "Moderately played or better", short: "MP+" },
  { value: "HP", label: "Heavily played or better", short: "HP+" },
  { value: "any", label: "Any condition", short: "Any" },
];

/**
 * The optimiser's preferences, as the search filter pills. There's no finish
 * pref: a finish comes with the printing a card is locked to. Stores is
 * a checklist with everything ticked — eBay included — and unticking one leaves
 * it out; it's stored as the unticked ids, so a new store starts ticked.
 *
 * Max stores is "All" (no limit) or a number from 1 up to the ticked stores
 * (eBay isn't counted). All sits below 1: + from All gives 1, − from 1 gives
 * All. The number can be typed too; empty or 0 means All.
 */
export function PrefsBar({
  prefs,
  stores,
  onChange,
}: {
  prefs: SavedPrefs;
  stores: StoreSummary[];
  onChange: (patch: Partial<SavedPrefs>, pref: string) => void;
}) {
  const condition = CONDITIONS.find((c) => c.value === prefs.minCondition)!;
  const excluded = new Set(prefs.excludeStores);
  // eBay last: it's a marketplace, not one shop.
  const storeList = [...stores.filter((s) => s.id !== "ebay_au"), ...stores.filter((s) => s.id === "ebay_au")];
  const unticked = storeList.filter((s) => excluded.has(s.id)).length;
  const available = storeList.filter((s) => s.id !== "ebay_au" && !excluded.has(s.id)).length;
  const max = prefs.maxStores;

  function setMax(n: number | null) {
    const valid = n !== null && Number.isFinite(n) && n >= 1;
    onChange({ maxStores: valid ? Math.min(Math.floor(n), Math.max(available, 1)) : null }, "max-stores");
  }

  function toggleStore(id: string) {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ excludeStores: [...next] }, "stores");
  }

  return (
    <div className="flex flex-nowrap items-center gap-2 sm:flex-wrap" role="group" aria-label="Optimiser preferences">
      <Dropdown label={`Condition: ${condition.short}`} active={prefs.minCondition !== "LP"}>
        {CONDITIONS.map((c) => (
          <OptionItem key={c.value} label={c.label} checked={c.value === prefs.minCondition}
            onClick={() => onChange({ minCondition: c.value }, "condition")} />
        ))}
      </Dropdown>

      <div
        className={`flex items-center gap-1 !py-1 ${pillClass(max !== null, "rounded-lg")}`}
        role="group"
        aria-label="Maximum number of stores"
        title="eBay listings aren’t counted — untick eBay under Buy from to leave them out."
      >
        <span>Max stores</span>
        <button
          onClick={() => setMax(max === null || max <= 1 ? null : max - 1)}
          disabled={max === null}
          aria-label="Fewer stores"
          className="flex h-6 w-6 items-center justify-center rounded text-sm hover:bg-muted disabled:opacity-30"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={available}
          value={max ?? ""}
          placeholder="All"
          onChange={(e) => setMax(e.target.value === "" ? null : Number(e.target.value))}
          aria-label="Max stores (empty for all)"
          className="w-[4ch] bg-transparent text-center tabular-nums text-cream placeholder:text-cream [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          onClick={() => setMax(max === null ? 1 : max + 1)}
          disabled={max !== null && max >= available}
          aria-label="More stores"
          className="flex h-6 w-6 items-center justify-center rounded text-sm hover:bg-muted disabled:opacity-30"
        >
          +
        </button>
      </div>

      <Dropdown
        label={unticked === 0 ? "Buy from: all stores" : `Buy from: ${storeList.length - unticked} of ${storeList.length} stores`}
        active={unticked > 0}
      >
        <div className="flex gap-3 border-b border-subtle px-3 py-2 text-xs">
          <button onClick={() => onChange({ excludeStores: [] }, "stores")} className="text-accent-light hover:underline">Select all</button>
          <button onClick={() => onChange({ excludeStores: storeList.map((s) => s.id) }, "stores")} className="text-cream-dim hover:underline">Clear</button>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {storeList.map((s) => (
            <OptionItem key={s.id} type="check" label={s.name} checked={!excluded.has(s.id)} onClick={() => toggleStore(s.id)} />
          ))}
        </div>
      </Dropdown>
    </div>
  );
}
