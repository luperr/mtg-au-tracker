"use client";

import { Dropdown, OptionItem } from "@/app/Dropdown";
import type { SavedPrefs } from "@/lib/optimiser/want-list";
import type { StoreSummary } from "@/lib/store-shipping";

const CONDITIONS: { value: SavedPrefs["minCondition"]; label: string; short: string }[] = [
  { value: "NM", label: "Near mint only", short: "NM" },
  { value: "LP", label: "Lightly played or better", short: "LP+" },
  { value: "MP", label: "Moderately played or better", short: "MP+" },
  { value: "HP", label: "Heavily played or better", short: "HP+" },
  { value: "any", label: "Any condition", short: "Any" },
];

const FINISHES: { value: SavedPrefs["finish"]; label: string }[] = [
  { value: "nonfoil", label: "Non-foil" },
  { value: "foil", label: "Foil" },
  { value: "any", label: "Any finish" },
];

const MAX_STORES: (number | null)[] = [null, 1, 2, 3, 4, 5];

/**
 * The optimiser's preferences, as the search filter pills. Finish only steers
 * "any printing" cards; a card pinned to its printing already has one. Stores is
 * a checklist with everything ticked — eBay included — and unticking one leaves
 * it out; it's stored as the unticked ids, so a new store starts ticked.
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
  const finish = FINISHES.find((f) => f.value === prefs.finish) ?? FINISHES[0];
  const excluded = new Set(prefs.excludeStores);
  // eBay last: it's a marketplace, not one shop.
  const storeList = [...stores.filter((s) => s.id !== "ebay_au"), ...stores.filter((s) => s.id === "ebay_au")];
  const unticked = storeList.filter((s) => excluded.has(s.id)).length;

  function toggleStore(id: string) {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ excludeStores: [...next] }, "stores");
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Optimiser preferences">
      <Dropdown label={`Condition: ${condition.short}`} active={prefs.minCondition !== "LP"}>
        {CONDITIONS.map((c) => (
          <OptionItem key={c.value} label={c.label} checked={c.value === prefs.minCondition}
            onClick={() => onChange({ minCondition: c.value }, "condition")} />
        ))}
      </Dropdown>

      <Dropdown label={`Finish: ${finish.label}`} active={prefs.finish !== "any"}>
        <p className="px-3 pt-2 pb-1 text-xs text-cream-dim">For cards set to “any printing”</p>
        {FINISHES.map((f) => (
          <OptionItem key={f.value} label={f.label} checked={f.value === prefs.finish}
            onClick={() => onChange({ finish: f.value }, "finish")} />
        ))}
      </Dropdown>

      <Dropdown label={prefs.maxStores === null ? "Max stores: any" : `Max stores: ${prefs.maxStores}`} active={prefs.maxStores !== null}>
        {MAX_STORES.map((n) => (
          <OptionItem key={n ?? "any"} label={n === null ? "Any number" : `At most ${n}`} checked={n === prefs.maxStores}
            onClick={() => onChange({ maxStores: n }, "max-stores")} />
        ))}
        <p className="px-3 pt-1 pb-2 text-xs text-cream-dim">eBay listings aren’t counted — untick eBay under Buy from to leave them out.</p>
      </Dropdown>

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
