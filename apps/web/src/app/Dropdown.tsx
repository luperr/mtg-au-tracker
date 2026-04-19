"use client";

import { useState, useRef, type ReactNode } from "react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";

export function Dropdown({
  label,
  active,
  align = "left",
  rounded = false,
  children,
}: {
  label: string;
  active?: boolean;
  align?: "left" | "right";
  rounded?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => setOpen(false));

  const shape = rounded ? "rounded-full" : "rounded-lg";
  const activeStyle = active
    ? "border-accent bg-accent/10 text-accent-light"
    : "border-subtle bg-muted/60 text-cream-dim hover:border-cream-dim/40 hover:text-cream";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 ${shape} border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${activeStyle}`}
      >
        {label}
        <span className="text-[9px] opacity-50">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className={`absolute top-full mt-1 z-30 min-w-[190px] rounded-lg border border-subtle bg-surface shadow-xl shadow-black/50 ${align === "right" ? "right-0" : "left-0"}`}>
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
