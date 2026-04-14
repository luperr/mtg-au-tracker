"use client";

import { useEffect, useState } from "react";

export type ViewMode = "card" | "text";

const STORAGE_KEY = "scrymarket-view";

export function useViewPreference(): [ViewMode, (v: ViewMode) => void] {
  const [view, setViewState] = useState<ViewMode>("card");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "card" || stored === "text") setViewState(stored);
  }, []);

  function setView(v: ViewMode) {
    setViewState(v);
    localStorage.setItem(STORAGE_KEY, v);
  }

  return [view, setView];
}
