"use client";

import { useCallback, useRef, useState } from "react";
import { trackEvent } from "@/lib/utils";
import type { OptimiseLine, OptimiseResponse, Prefs } from "@/lib/optimiser/types";

/** Answers kept for re-presses (Undo then Optimise, a chip then "All stores"); older ones are dropped. */
const CACHE_SIZE = 8;

function errorMessage(status: number, body: { error?: string } | null): string {
  if (status === 429) return "Too many optimiser runs — wait a minute and try again.";
  if (status === 400) return body?.error ?? "Your want list couldn't be read.";
  return "The optimiser failed. Try again in a moment.";
}

/**
 * Runs /api/optimize when asked — the want list's Optimise button and its
 * store-count chips. `run` resolves to the answer, or null if it failed (the
 * message is in `error`). Recent answers are memoised per request, so
 * re-pressing with nothing changed costs no server run.
 */
export function useOptimiser() {
  const cache = useRef(new Map<string, OptimiseResponse>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (request: { lines: OptimiseLine[]; prefs: Prefs }): Promise<OptimiseResponse | null> => {
    setError(null);
    const body = JSON.stringify(request);
    const hit = cache.current.get(body);
    if (hit) return hit;
    setLoading(true);
    try {
      const res = await fetch("/api/optimize", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) throw new Error(errorMessage(res.status, await res.json().catch(() => null)));
      const data = await res.json() as OptimiseResponse;
      cache.current.set(body, data);
      if (cache.current.size > CACHE_SIZE) cache.current.delete(cache.current.keys().next().value!);
      // Every run is applied to the list, so this one event covers what used to be run + apply.
      // Whole dollars: enough to tell "saved nothing" from "saved $40" without logging the basket.
      trackEvent("optimise-run", {
        version: "v2",
        lines: request.lines.length,
        units: data.plan.totals.unitsWanted,
        stores: data.plan.totals.storeCount,
        unavailable: data.unavailable.length,
        alternatives: data.alternatives.length,
        saving: data.savingsCents === null ? null : Math.round(data.savingsCents / 100),
      });
      return data;
    } catch (err) {
      trackEvent("optimise-run", { version: "v2", error: true });
      setError(err instanceof Error && err.message ? err.message : "The optimiser failed. Try again in a moment.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { run, loading, error };
}
