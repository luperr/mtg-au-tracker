"use client";

export type ViewMode = "medium" | "compact";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const OPTIONS: { mode: ViewMode; label: string; title: string }[] = [
  { mode: "medium", label: "⊞", title: "Grid view" },
  { mode: "compact", label: "☰", title: "Compact view" },
];

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-subtle bg-muted p-0.5">
      {OPTIONS.map(({ mode, label, title }) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          title={title}
          className={`rounded px-2 py-1 text-sm transition-colors ${
            value === mode
              ? "bg-surface text-cream shadow-sm"
              : "text-cream-dim/50 hover:text-cream-dim"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
