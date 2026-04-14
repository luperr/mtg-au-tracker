"use client";

import type { ViewMode } from "@/lib/hooks/useViewPreference";

export function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="flex items-center rounded-lg border border-subtle bg-muted overflow-hidden shrink-0">
      <button
        onClick={() => onChange("card")}
        title="Card view"
        className={`flex items-center justify-center w-8 h-8 transition-colors ${
          view === "card"
            ? "bg-accent-muted text-accent-light"
            : "text-cream-dim/50 hover:text-cream"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <rect x="0" y="0" width="6" height="6" rx="1" />
          <rect x="8" y="0" width="6" height="6" rx="1" />
          <rect x="0" y="8" width="6" height="6" rx="1" />
          <rect x="8" y="8" width="6" height="6" rx="1" />
        </svg>
      </button>
      <button
        onClick={() => onChange("text")}
        title="List view"
        className={`flex items-center justify-center w-8 h-8 transition-colors ${
          view === "text"
            ? "bg-accent-muted text-accent-light"
            : "text-cream-dim/50 hover:text-cream"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <rect x="0" y="1" width="14" height="2" rx="1" />
          <rect x="0" y="6" width="14" height="2" rx="1" />
          <rect x="0" y="11" width="14" height="2" rx="1" />
        </svg>
      </button>
    </div>
  );
}
