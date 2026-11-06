"use client";

import { useState } from "react";
import { fmtAUD } from "@/lib/utils";

/** A store's flat postage, click to edit: "In-store" sets it to $0 for collection. */
export function EditablePostageRow({
  amount,
  isOverride,
  onSave,
}: {
  amount: number | null;
  isOverride: boolean;
  onSave: (amount: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEdit() {
    setDraft(amount !== null ? String(amount) : "");
    setEditing(true);
  }

  function commit() {
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) onSave(n);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-cream-dim/50">
        <span>Postage: $</span>
        <input
          autoFocus
          type="number"
          min="0"
          step="0.50"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="w-14 bg-muted border border-accent-border rounded px-1 py-0.5 text-cream text-xs text-right [appearance:textfield]"
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onSave(0); setEditing(false); }}
          className="text-[10px] text-cream-dim/40 hover:text-green-400 transition-colors whitespace-nowrap"
        >
          In-store
        </button>
        {isOverride && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onSave(null); setEditing(false); }}
            className="text-[10px] text-cream-dim/30 hover:text-cream-dim/60 transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-xs text-cream-dim/50">
      <button
        onClick={startEdit}
        title="Click to edit postage"
        className="flex items-center gap-1 bg-muted border border-accent-border rounded px-1.5 py-0.5 hover:border-accent-light/50 hover:text-cream-dim transition-colors cursor-pointer"
      >
        {amount === null
          ? "Postage: unknown"
          : amount === 0
          ? "Postage: free (in-store)"
          : `Postage: ${fmtAUD(amount)}`}
        {isOverride && <span className="ml-1 text-[9px] text-accent-light/60">·edited</span>}
      </button>
      {!isOverride && amount !== null && (
        <span
          className="cursor-help text-[10px] text-cream-dim/30"
          title="Estimated. Postage is charged once per order and the actual amount may vary at checkout."
        >
          ⓘ
        </span>
      )}
    </div>
  );
}
