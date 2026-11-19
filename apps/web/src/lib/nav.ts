/**
 * Site pages, for the phone menu (`app/NavMenu.tsx`) and the footer (`app/layout.tsx`), so a
 * page is added in one place. Plain module, not "use client": the layout is a server component.
 */

export type NavLink = {
  href: string;
  /** The menu's label. */
  label: string;
  /** The footer's, where space is short. Defaults to `label`. */
  shortLabel?: string;
};

/** Menu only — the header already covers these on desktop. */
export const APP_PAGES: NavLink[] = [
  { href: "/", label: "Search" },
  { href: "/want-list", label: "Want list" },
];

/** In the menu, and in the footer from sm up. */
export const INFO_PAGES: NavLink[] = [
  { href: "/changelog", label: "What's new", shortLabel: "Changelog" },
  { href: "/about", label: "About & stores", shortLabel: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

/** Everywhere, at every width. */
export const LEGAL_PAGES: NavLink[] = [
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];
