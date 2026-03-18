import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Scrymarket",
  description: "How Scrymarket handles your data.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-cream mb-3">Privacy Policy</h1>
        <p className="text-cream-dim text-sm">Last updated: March 2026</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">Summary</h2>
        <p className="text-cream-dim leading-relaxed">
          Scrymarket does not collect, store, or share any personal information about its
          visitors. There are no user accounts, no login, no tracking pixels, and no
          third-party analytics scripts.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">What data we collect</h2>
        <p className="text-cream-dim leading-relaxed">
          We collect no personal data. Specifically:
        </p>
        <ul className="list-disc list-inside space-y-1 text-cream-dim leading-relaxed">
          <li>No account registration or login is required or offered.</li>
          <li>No names, email addresses, or contact details are collected.</li>
          <li>No payment information is collected — Scrymarket does not sell anything.</li>
          <li>No IP addresses are stored by the application.</li>
          <li>No behavioural tracking or analytics scripts are loaded.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">Cookies and local storage</h2>
        <p className="text-cream-dim leading-relaxed">
          Scrymarket uses browser <code className="text-accent bg-muted px-1 py-0.5 rounded text-xs">localStorage</code> to
          remember your dark/light theme preference. This data never leaves your browser and is
          not transmitted to any server. No cookies are set.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">Third-party services</h2>
        <p className="text-cream-dim leading-relaxed">
          The site loads card images and mana cost symbol SVGs directly from Scryfall&apos;s CDN
          (<code className="text-accent bg-muted px-1 py-0.5 rounded text-xs">svgs.scryfall.io</code> and{" "}
          <code className="text-accent bg-muted px-1 py-0.5 rounded text-xs">cards.scryfall.io</code>).
          When your browser fetches these assets, Scryfall&apos;s servers will receive your IP
          address as part of the standard HTTP request. Scryfall&apos;s privacy policy governs
          that data.
        </p>
        <p className="text-cream-dim leading-relaxed">
          No other third-party scripts, fonts, or tracking services are loaded.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">Server logs</h2>
        <p className="text-cream-dim leading-relaxed">
          Web servers and hosting infrastructure may produce access logs containing IP addresses
          and request paths as part of normal operation. These logs are used only for diagnosing
          technical issues and are not shared with third parties.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">Changes to this policy</h2>
        <p className="text-cream-dim leading-relaxed">
          If this policy changes materially — for example, if analytics or user accounts are
          added in future — the &ldquo;Last updated&rdquo; date above will reflect that. We recommend
          checking back if you use the site regularly.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">Contact</h2>
        <p className="text-cream-dim leading-relaxed">
          Questions about this policy?{" "}
          <a href="/contact" className="text-accent hover:underline">
            Get in touch.
          </a>
        </p>
      </section>
    </div>
  );
}
