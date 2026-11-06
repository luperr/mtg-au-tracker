"use client";

import { useRouter } from "next/navigation";
import { setCookie, ONE_YEAR_SECONDS, trackEvent } from "@/lib/utils";
import { OPTIMISER_V2_COOKIE } from "@/lib/optimiser/flag";

/**
 * Opt in or out of the v2 want list. Always writes an explicit "1"/"0", so a
 * choice survives OPTIMISER_V2_DEFAULT being flipped later — as search v2 does.
 */
export function OptimiserV2Toggle({ on }: { on: boolean }) {
  const router = useRouter();

  function toggle() {
    setCookie(OPTIMISER_V2_COOKIE, on ? "0" : "1", ONE_YEAR_SECONDS);
    trackEvent("optimiser-v2-toggle", { on: !on });
    router.refresh();
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-accent-border bg-accent-muted/40 px-4 py-2.5 text-sm">
      <p className="text-cream-dim">
        {on ? (
          <><span className="font-semibold text-cream">New optimiser (beta).</span> Something off? <a href="/contact" className="text-link hover:underline">Tell us</a>.</>
        ) : (
          <><span className="font-semibold text-cream">Try the new optimiser (beta):</span> quantities, condition and foil preferences, and a store-by-store buying plan.</>
        )}
      </p>
      <button
        onClick={toggle}
        className="shrink-0 rounded-lg border border-accent-border px-3 py-1.5 text-xs font-semibold text-accent-light hover:bg-accent-muted transition-colors"
      >
        {on ? "Switch back" : "Try it"}
      </button>
    </div>
  );
}
