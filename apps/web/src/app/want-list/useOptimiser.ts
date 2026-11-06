"use client";

import { useCallback, useRef, useState } from "react";
import { trackEvent } from "@/lib/utils";
import type { OptimiseResponse } from "@/lib/optimiser/types";

function errorMessage(status: number, body: { error?: string } | null): string {
  if (status === 429) return "Too many optimiser runs — wait a minute and try again.";
  if (status === 400) return body?.error ?? "Your want list couldn't be read.";
  return "The optimiser failed. Try again in a moment.";
}

/**
 * Runs /api/optimize when asked — the want list's Optimise button and its
 * store-count chips. `run` resolves to the answer, or null if it failed (the
 * message is in `error`). Answers are memoised per request, so re-pressing with
 * nothing changed costs no server run.
 */
export function useOptimiser() {
  const cache = useRef(new Map<string, OptimiseResponse>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (body: string): Promise<OptimiseResponse | null> => {
    setError(null);
    const hit = cache.current.get(body);
    if (hit) return hit;
    setLoading(true);
    try {
      const res = await fetch("/api/optimize", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) throw new Error(errorMessage(res.status, await res.json().catch(() => null)));
      const data = await res.json() as OptimiseResponse;
      cache.current.set(body, data);
      // Whole dollars: enough to tell "saved nothing" from "saved $40" without logging the basket.
      trackEvent("optimise-run", {
        version: "v2",
        lines: (JSON.parse(body) as { lines: unknown[] }).lines.length,
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
