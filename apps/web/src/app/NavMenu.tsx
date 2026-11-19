"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sheet } from "./Sheet";
import { ThemeToggle } from "./ThemeToggle";
import { useWantList } from "./WantListContext";
import { APP_PAGES, INFO_PAGES, LEGAL_PAGES } from "@/lib/nav";

const PAGES = [...APP_PAGES, ...INFO_PAGES];

/**
 * The phone menu: below sm every page except search and the want list used to be reachable
 * only from the footer. Desktop keeps its header as it was and gets no ☰.
 *
 * `extra` is rendered at the bottom of the sheet — the layout passes the Buy Me a Coffee link,
 * a server component, through it.
 */
export function NavMenu({ extra }: { extra?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { totalCount } = useWantList();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="sm:hidden -ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl text-cream-dim active:bg-muted"
      >
        ☰
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} side="left" title="Menu" className="sm:hidden">
        <nav aria-label="Main">
          <ul className="py-1">
            {PAGES.map(({ href, label }) => {
              const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <li key={href}>
                  <a
                    href={href}
                    aria-current={current ? "page" : undefined}
                    className={`flex h-12 items-center justify-between px-4 text-sm active:bg-muted ${
                      current ? "font-semibold text-cream" : "text-cream-dim"
                    }`}
                  >
                    {label}
                    {href === "/want-list" && totalCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-price px-1.5 text-[11px] font-bold text-bg">
                        {totalCount}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-subtle py-1">
          <ThemeToggle variant="menu" />
        </div>
        <div className="border-t border-subtle px-4 py-4 space-y-4">
          {extra}
          <p className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-cream-dim/60">
            {LEGAL_PAGES.map(({ href, label }) => (
              <a key={href} href={href} className="hover:text-accent">{label}</a>
            ))}
          </p>
        </div>
      </Sheet>
    </>
  );
}
