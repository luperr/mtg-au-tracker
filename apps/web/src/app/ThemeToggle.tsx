"use client";

import { useEffect, useState } from "react";

const THEME_EVENT = "scrymarket:theme";

/**
 * Light/dark state, shared by every toggle on the page — the header has one from sm up and
 * the mobile menu has its own, and flipping either has to move both.
 */
function useTheme(): [boolean, () => void] {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const sync = () => setLight(document.documentElement.getAttribute("data-theme") === "light");
    sync();
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  function toggle() {
    const next = !light;
    if (next) document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {
      // Storage blocked: the theme still applies for this page.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return [light, toggle];
}

function Switch({ light }: { light: boolean }) {
  return (
    <span className={`relative inline-block h-4 w-7 rounded-full transition-colors ${light ? "bg-accent" : "bg-subtle"}`}>
      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-cream transition-transform ${light ? "translate-x-3.5" : "translate-x-0.5"}`} />
    </span>
  );
}

/**
 * `header`: the compact pill, shown from sm up (phones get it in the menu instead).
 * `menu`: a full-width row for the mobile nav sheet.
 */
export function ThemeToggle({ variant = "header" }: { variant?: "header" | "menu" }) {
  const [light, toggle] = useTheme();
  const label = light ? "Switch to dark theme" : "Switch to light theme";

  if (variant === "menu") {
    return (
      <button onClick={toggle} aria-label={label} className="flex h-12 w-full items-center justify-between px-4 text-sm text-cream-dim active:bg-muted">
        <span>{light ? "☀ Light theme" : "☾ Dark theme"}</span>
        <Switch light={light} />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      aria-label={label}
      className="hidden sm:flex items-center gap-1.5 rounded-full border border-subtle bg-muted px-3 py-1 text-xs font-medium text-cream-dim transition-colors hover:border-accent hover:text-cream"
    >
      <span className={light ? "opacity-100" : "opacity-40"}>☀</span>
      <Switch light={light} />
      <span className={light ? "opacity-40" : "opacity-100"}>☾</span>
    </button>
  );
}
