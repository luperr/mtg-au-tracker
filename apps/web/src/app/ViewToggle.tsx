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
      {/* Grid view: image-dominant card grid */}
      <button
        onClick={() => onChange("grid")}
        title="Grid view"
        className={`flex items-center justify-center w-8 h-8 transition-colors ${
          view === "grid"
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

      {/* Card view: thumbnail rows */}
      <button
        onClick={() => onChange("card")}
        title="Card row view"
        className={`flex items-center justify-center w-8 h-8 transition-colors ${
          view === "card"
            ? "bg-accent-muted text-accent-light"
            : "text-cream-dim/50 hover:text-cream"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          {/* small card thumbnail on left */}
          <rect x="0" y="1" width="4" height="5" rx="0.5" />
          {/* two text lines on right */}
          <rect x="6" y="2" width="8" height="1.5" rx="0.75" />
          <rect x="6" y="5" width="5" height="1.5" rx="0.75" />
          {/* second row */}
          <rect x="0" y="8" width="4" height="5" rx="0.5" />
          <rect x="6" y="9" width="8" height="1.5" rx="0.75" />
          <rect x="6" y="12" width="5" height="1.5" rx="0.75" />
        </svg>
      </button>

      {/* Text view: minimal list */}
      <button
        onClick={() => onChange("text")}
        title="Text view"
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
