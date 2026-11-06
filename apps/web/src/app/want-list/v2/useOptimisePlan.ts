"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/utils";
import type { OptimiseResponse } from "@/lib/optimiser/types";

/** Edits (a qty stepper, a pref) settle for this long before the optimiser re-runs. */
const DEBOUNCE_MS = 500;

export type PlanState = {
  data: OptimiseResponse | null;
  /** The request `data` answers. When it differs from the current one, `data` is stale. */
  dataBody: string | null;
  loading: boolean;
  error: string | null;
};

function errorMessage(status: number, body: { error?: string } | null): string {
  if (status === 429) return "Too many optimiser runs — wait a minute and try again.";
  if (status === 400) return body?.error ?? "Your want list couldn't be read.";
  return "The optimiser failed. Try again in a moment.";
}

/**
 * Runs /api/optimize/v2 for `body` (a serialised request), re-running when it
 * changes. Answers are memoised by request, so flipping a pref back and forth or
 * clicking between store-count chips costs nothing after the first run — the
 * route allows 20 runs a minute. `body` null means don't run yet.
 */
export function useOptimisePlan(body: string | null): PlanState & { retry: () => void } {
  const cache = useRef(new Map<string, OptimiseResponse>());
  const [state, setState] = useState<PlanState>({ data: null, dataBody: null, loading: false, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (body === null) return;
    const hit = cache.current.get(body);
    if (hit) {
      setState({ data: hit, dataBody: body, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/optimize/v2", {
          method: "POST", headers: { "Content-Type": "application/json" }, body, signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(errorMessage(res.status, await res.json().catch(() => null)));
        const data = await res.json() as OptimiseResponse;
        cache.current.set(body, data);
        setState({ data, dataBody: body, loading: false, error: null });
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
      } catch (err) {
        if (ctrl.signal.aborted) return;
        trackEvent("optimise-run", { version: "v2", error: true });
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error && err.message ? err.message : "The optimiser failed. Try again in a moment.",
        }));
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [body, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
