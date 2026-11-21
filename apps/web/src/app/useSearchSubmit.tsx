"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Submitting a card search from the header or the landing box.
 *
 * The navigation runs as a transition, so `pending` stays true until the results have rendered —
 * the boxes show it at once. Before this, Enter did nothing visible until the server answered,
 * and people pressed it again (Loki: one query five times in a second), each press another
 * search queued on the database. A repeat of the search already on its way is now ignored.
 */
export function useSearchSubmit(): { submit: (raw: string) => void; pending: boolean } {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!pending) inFlight.current = null;
  }, [pending]);

  function submit(raw: string) {
    const q = raw.trim();
    if (!q || (pending && inFlight.current === q)) return;
    inFlight.current = q;
    // Drop the phone keyboard, so the results are visible as they arrive.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    startTransition(() => router.push(`/?q=${encodeURIComponent(q)}`));
  }

  return { submit, pending };
}

/** A thin bar across the top of the screen while a search is on its way. */
export function SearchPendingBar({ active }: { active: boolean }) {
  if (!active) return null;
  return <div aria-hidden className="fixed inset-x-0 top-0 z-[60] h-0.5 animate-pulse bg-accent" />;
}

/** A small spinner for a submit button. */
export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}
