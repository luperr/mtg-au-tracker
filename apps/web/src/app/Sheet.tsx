"use client";

import { useEffect } from "react";

/**
 * A modal panel that slides in from the left edge (menus, filters) or up from the bottom
 * (pickers on phones). Owns the backdrop, Escape-to-close and the body scroll lock;
 * the body scrolls on its own so the title and footer stay put.
 *
 * Always mounted, so the slide animates both ways; `open` drives it. Pass a breakpoint
 * class such as `md:hidden` via `className` when the sheet only exists on small screens.
 */
export function Sheet({
  open, onClose, side, title, actions, footer, className = "", children,
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "bottom";
  /** Heading, and the dialog's accessible name. */
  title: React.ReactNode;
  /** Extra controls beside the close button. */
  actions?: React.ReactNode;
  /** Pinned below the scrolling body. */
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const panel = side === "left"
    ? `inset-y-0 left-0 w-80 max-w-[85vw] border-r ${open ? "translate-x-0" : "-translate-x-full"}`
    : `inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl border-t pb-[env(safe-area-inset-bottom)] ${open ? "translate-y-0" : "translate-y-full"}`;

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"} ${className}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-black/60 transition-opacity ${open ? "opacity-100" : "opacity-0"}`} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={`absolute flex flex-col bg-surface border-subtle shadow-2xl transition-transform ${panel}`}
      >
        {side === "bottom" && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-subtle" aria-hidden />}
        <div className="flex items-center gap-1 px-4 py-3 shrink-0">
          <h2 className="mr-auto min-w-0 truncate text-sm font-semibold text-cream">{title}</h2>
          {actions}
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-10 w-10 items-center justify-center text-lg leading-none text-cream-dim hover:text-cream"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="shrink-0 border-t border-subtle px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
