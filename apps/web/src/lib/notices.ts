/**
 * The notices strip under the landing-page search box (LandingNotices.tsx).
 *
 * Two kinds of line: hand-written PINNED_NOTICES, and one generated from the newest
 * changelog entry so it never needs updating by hand. Pure — `today` is passed in.
 */

/** "new" pulses — keep it for a promo line or something being actively trialled, never routine news. */
export type NoticeMarker = "new" | "star";

/** Client behaviours a notice can trigger instead of navigating — see NoticeAction.tsx. */
export type NoticeAction = "enable-search-v2";

export type NoticeLink =
  | { label: string; href: string }
  /** `doneLabel` replaces the button once the action is already in effect. */
  | { label: string; action: NoticeAction; doneLabel: string };

export type Notice = {
  marker: NoticeMarker;
  text: string;
  link: NoticeLink;
  /** Last Sydney date (YYYY-MM-DD) the line shows. Omit to pin indefinitely. */
  until?: string;
};

export const MAX_LANDING_NOTICES = 3;

const SUMMARY_MAX_CHARS = 48;

/** Hand-written lines, in display order. The latest-changelog line is appended after them. */
export const PINNED_NOTICES: Notice[] = [
  { marker: "new", text: "advanced search is live", link: { label: "try it", action: "enable-search-v2", doneLabel: "on ✓" }, until: "2026-11-30" },
  { marker: "star", text: "got any feedback?", link: { label: "reach out", href: "/contact" } },
];

/** Today in Sydney as YYYY-MM-DD — the timezone .github/workflows/changelog.yml dates entries in. */
export function sydneyToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(now);
}

/** First clause of a changelog entry, trimmed at a word boundary to fit on one line. */
export function summarise(text: string): string {
  const clause = text.split(/[.:]\s/)[0].replace(/\.$/, "").trim();
  if (clause.length <= SUMMARY_MAX_CHARS) return clause;
  const cut = clause.slice(0, SUMMARY_MAX_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;]$/, "")}…`;
}

/**
 * The lines to render, at most MAX_LANDING_NOTICES. The changelog line always keeps its
 * slot; unexpired pinned lines fill the rest in order. The changelog line is always a
 * star — the pulse is reserved for pinned promo lines.
 */
export function landingNotices(
  today: string,
  latest: { date: string; text: string } | undefined,
  pinned: Notice[] = PINNED_NOTICES,
): Notice[] {
  const active = pinned.filter((n) => n.until === undefined || today <= n.until);
  if (!latest) return active.slice(0, MAX_LANDING_NOTICES);

  const changelog: Notice = {
    marker: "star",
    text: `latest: ${summarise(latest.text)}`,
    link: { label: "changelog", href: "/changelog" },
  };
  return [...active.slice(0, MAX_LANDING_NOTICES - 1), changelog];
}
