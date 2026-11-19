"use client";

import { useEffect, useRef } from "react";

/**
 * What every modal surface needs while it is open: Escape closes it, and the page behind
 * it stops scrolling (otherwise iOS scrolls the page under a sheet). Shared by `Sheet` and
 * the optimiser dialog.
 *
 * `onClose` is read through a ref, so callers can pass an inline function without the
 * listener being torn down and re-added on every render.
 */
export function useModalBehaviour(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
}
