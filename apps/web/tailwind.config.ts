// Tailwind 4 works at runtime without this file — the @theme {} block in
// globals.css is the source of truth. This file exists solely so IDE plugins
// (VSCode Tailwind CSS IntelliSense, JetBrains) can autocomplete the custom
// semantic token names like `bg-surface`, `text-cream`, `text-price` etc.
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        bg:      "var(--color-bg)",
        surface: "var(--color-surface)",
        muted:   "var(--color-muted)",
        subtle:  "var(--color-subtle)",

        // Cream text scale
        cream: {
          DEFAULT: "var(--color-cream)",
          dim:     "var(--color-cream-dim)",
          muted:   "var(--color-cream-muted)",
        },

        // Teal accent
        accent: {
          DEFAULT: "var(--color-accent)",
          light:   "var(--color-accent-light)",
          border:  "var(--color-accent-border)",
          dim:     "var(--color-accent-dim)",
          muted:   "var(--color-accent-muted)",
        },

        // Price / CTA
        price: {
          DEFAULT: "var(--color-price)",
          muted:   "var(--color-price-muted)",
        },
        cta: "var(--color-cta)",
      },
    },
  },
  plugins: [],
};

export default config;
