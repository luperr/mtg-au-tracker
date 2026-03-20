"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";

export function Dropdown({
  label,
  active,
  children,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
          active
            ? "border-accent-border bg-accent-muted text-accent-light"
            : "border-subtle bg-muted text-cream-dim hover:text-cream hover:border-accent-border"
        }`}
      >
        {label}
        <span className="text-[9px] opacity-50">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 min-w-[190px] rounded-lg border border-subtle bg-surface shadow-xl shadow-black/50">
          {children}
        </div>
      )}
    </div>
  );
}

export function OptionItem({
  label,
  checked,
  onClick,
  type = "radio",
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  type?: "radio" | "check";
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
        checked ? "text-cream" : "text-cream-dim"
      }`}
    >
      <span
        className={`w-3 h-3 ${type === "radio" ? "rounded-full" : "rounded"} border shrink-0 ${
          checked ? "border-accent bg-accent" : "border-subtle"
        }`}
      />
      {label}
    </button>
  );
}
