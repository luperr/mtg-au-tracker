import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog — Scrymarket",
  description: "Recent updates and improvements to Scrymarket.",
};

const entries: { date: string; text: string }[] = [
  {
    date: "2026-05-31",
    text: "Issue with match rate for crit hit and mega games resolived.",
  },
  {
    date: "2026-05-30",
    text: "Fixed store scrapers for Area 52, Elemental Arcade, and GUF — all three were returning zero results due to wrong collection handles or location-based variant formats. Added a Changelog page so you can track what's new.",
  },
  {
    date: "2026-05-08",
    text: "Added Shuffle and Cut Games as a new tracked store. Requested via community feedback.",
  },
  {
    date: "2026-03-31",
    text: "Double-faced cards now match correctly and show a flip button on the card detail page. The Want List printing selector shows variant labels (Etched, Borderless Foil, Showcase, etc.) so you can tell printings apart at a glance. Mobile layout improvements on the card detail prices table.",
  },
  {
    date: "2026-03-01",
    text: "Launched Scrymarket in public beta. Tracks Australian dollar prices across 30+ local stores and eBay AU, updated daily. Includes a Want List with an optimiser that finds the cheapest store combination factoring in flat-rate postage.",
  },
];

export default function ChangelogPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-cream mb-3">Changelog</h1>
        <p className="text-cream-dim text-sm">What&apos;s new on Scrymarket.</p>
      </header>

      <ol className="space-y-4">
        {entries.map(({ date, text }, i) => (
          <li key={i} className="rounded-lg border border-accent-border bg-muted/40 px-5 py-4 space-y-2">
            <time className="block text-xs font-mono text-accent tracking-wide">{date}</time>
            <p className="text-cream-dim leading-relaxed">{text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
