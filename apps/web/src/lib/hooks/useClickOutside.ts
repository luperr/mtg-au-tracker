import { useEffect, type RefObject } from "react";

export function useClickOutside(ref: RefObject<HTMLElement | null>, enabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, enabled, onClose]);
}
