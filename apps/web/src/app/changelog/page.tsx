import type { Metadata } from "next";
import changelog from "./entries.json";

export const metadata: Metadata = {
  title: "Changelog — Scrymarket",
  description: "Recent updates and improvements to Scrymarket.",
};

// Newest first; `pr` is the PR the change shipped in. New entries are added on merge by
// .github/workflows/changelog.yml from a `<!-- changelog: ... -->` marker in the PR description.
const entries: { date: string; text: string; pr?: number }[] = changelog;

export default function ChangelogPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-cream mb-3">Changelog</h1>
        <p className="text-cream-dim text-sm">What&apos;s new on Scrymarket.</p>
      </header>

      <ol className="space-y-4">
        {entries.map(({ date, text }) => (
          <li key={`${date}-${text}`} className="rounded-lg border border-accent-border bg-muted/40 px-5 py-4 space-y-2">
            <time className="block text-xs font-mono text-accent tracking-wide">{date}</time>
            <p className="text-cream-dim leading-relaxed">{text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
