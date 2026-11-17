"use client";

import { useSyncExternalStore } from "react";
import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from "@/lib/config";

const THEME_EVENT = "scrymarket:theme";

const isLight = () => document.documentElement.getAttribute(THEME_ATTRIBUTE) === "light";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function toggleTheme(): void {
  const light = !isLight();
  if (light) document.documentElement.setAttribute(THEME_ATTRIBUTE, "light");
  else document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, light ? "light" : "dark");
  } catch {
    // Storage blocked: the theme still applies for this page.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * The theme lives on <html> (set before paint by the inline script in layout.tsx); every
 * toggle reads it from there, so the header's and the menu's stay in step. Dark on the server.
 */
function useLightTheme(): boolean {
  return useSyncExternalStore(subscribe, isLight, () => false);
}

/** ☀ ⬤ ☾ in the header; the menu row, which labels itself, drops the icons. */
function ThemePill({ light, icons = true }: { light: boolean; icons?: boolean }) {
  return (
    <span aria-hidden className="flex items-center gap-1.5 rounded-full border border-subtle bg-muted px-3 py-1 text-xs font-medium transition-colors group-hover:border-accent group-hover:text-cream">
      {icons && <span className={light ? "opacity-100" : "opacity-40"}>☀</span>}
      <span className={`relative inline-block h-4 w-7 shrink-0 rounded-full transition-colors ${light ? "bg-accent" : "bg-subtle"}`}>
        <span className={`absolute left-0 top-0.5 h-3 w-3 rounded-full bg-cream transition-transform ${light ? "translate-x-3.5" : "translate-x-0.5"}`} />
      </span>
      {icons && <span className={light ? "opacity-40" : "opacity-100"}>☾</span>}
    </span>
  );
}

/**
 * `header`: the pill on its own, shown from sm up (phones get it in the menu instead).
 * `menu`: a full-width "Theme toggle" row carrying the same pill, for the mobile nav sheet.
 */
export function ThemeToggle({ variant = "header" }: { variant?: "header" | "menu" }) {
  const light = useLightTheme();

  if (variant === "menu") {
    // A switch named by its visible label plus the current state, e.g. "Theme toggle: dark".
    return (
      <button
        role="switch"
        aria-checked={light}
        onClick={toggleTheme}
        className="flex h-12 w-full items-center justify-between px-4 text-sm text-cream-dim active:bg-muted"
      >
        <span>Theme toggle<span className="sr-only">: {light ? "light" : "dark"}</span></span>
        <ThemePill light={light} icons={false} />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      className="group hidden sm:flex rounded-full text-cream-dim"
    >
      <ThemePill light={light} />
    </button>
  );
}
