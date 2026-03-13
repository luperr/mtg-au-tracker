"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light") {
      setLight(true);
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "dark");
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      className="flex items-center gap-1.5 rounded-full border border-subtle bg-muted px-3 py-1 text-xs font-medium text-cream-dim transition-colors hover:border-accent hover:text-cream"
    >
      <span className={light ? "opacity-100" : "opacity-40"}>☀</span>
      <span
        className={`relative inline-block h-4 w-7 rounded-full transition-colors ${light ? "bg-accent" : "bg-subtle"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-cream transition-transform ${light ? "translate-x-3.5" : "translate-x-0.5"}`}
        />
      </span>
      <span className={light ? "opacity-40" : "opacity-100"}>☾</span>
    </button>
  );
}
