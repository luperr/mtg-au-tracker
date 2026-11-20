"use client";

import { useRef, useState } from "react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";

/**
 * An ⓘ that shows a short note. Tap toggles it, because touch has no hover; `title`
 * still gives desktop the hover version. The bubble opens below and right-aligned, so
 * put it at the right of a row.
 */
export function InfoTip({ text, label = "More info" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // don't toggle the row it sits in
          setOpen(!open);
        }}
        aria-label={label}
        aria-expanded={open}
        title={text}
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm text-cream-dim/60 hover:text-cream"
      >
        ⓘ
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute right-0 top-full z-10 mt-1 w-60 max-w-[calc(100vw-3rem)] rounded-lg border border-subtle bg-surface px-3 py-2 text-xs leading-relaxed text-cream-dim shadow-xl shadow-black/50"
        >
          {text}
        </span>
      )}
    </span>
  );
}
