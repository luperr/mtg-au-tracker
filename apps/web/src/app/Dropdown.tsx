"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside — must check both the button and the portal panel
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Reposition the panel whenever it opens or the window scrolls/resizes
  useEffect(() => {
    if (!open || !buttonRef.current) return;

    function reposition() {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const top = rect.bottom + window.scrollY + 4;
      const style: React.CSSProperties = { top };
      if (align === "right") {
        const panelWidth = panelRef.current?.offsetWidth ?? 190;
        style.left = rect.right + window.scrollX - panelWidth;
      } else {
        style.left = rect.left + window.scrollX;
      }
      setPanelStyle(style);
    }

    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, align]);

  const shape = rounded ? "rounded-full" : "rounded-lg";
  const activeStyle = active
    ? "border-accent bg-accent/10 text-accent-light"
    : "border-subtle bg-muted/60 text-cream-dim hover:border-cream-dim/40 hover:text-cream";

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 ${shape} border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${activeStyle}`}
      >
        {label}
        <span className="text-[9px] opacity-50">{open ? "▲" : "▼"}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ ...panelStyle, position: "absolute", zIndex: 9999, minWidth: 190 }}
            className="rounded-lg border border-subtle bg-surface shadow-xl shadow-black/50"
          >
            {children}
          </div>,
          document.body
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
