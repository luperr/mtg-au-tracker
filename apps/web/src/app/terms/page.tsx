import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — Scrymarket",
  description: "Terms governing use of the Scrymarket website.",
};

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-cream mb-3">Terms of Use</h1>
        <p className="text-cream-dim text-sm">Last updated: March 2026</p>
      </header>

      <p className="text-cream-dim leading-relaxed">
        By using Scrymarket (&ldquo;the site&rdquo;, &ldquo;the service&rdquo;), you agree to these terms. If you
        do not agree, please do not use the site.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">1. Nature of the service</h2>
        <p className="text-cream-dim leading-relaxed">
          Scrymarket is a free, informational price-comparison tool for Magic: The Gathering
          cards in the Australian market. It is not a retailer, marketplace, or broker. It does
          not sell cards, process payments, or facilitate transactions between buyers and sellers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">2. Accuracy of price data</h2>
        <p className="text-cream-dim leading-relaxed">
          Price data is collected automatically and may be delayed, incomplete, or incorrect.
          We make no warranties, express or implied, about the accuracy, completeness, or
          timeliness of any price data displayed. You use this data at your own risk. See also
          our{" "}
          <a href="/disclaimer" className="text-accent hover:underline">
            Disclaimer
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">3. Acceptable use</h2>
        <p className="text-cream-dim leading-relaxed">You agree not to:</p>
        <ul className="list-disc list-inside space-y-1 text-cream-dim leading-relaxed">
          <li>Use automated tools to scrape or bulk-download data from this site at a rate that degrades service for others.</li>
          <li>Attempt to gain unauthorised access to the server or database.</li>
          <li>Use the site in any way that violates applicable Australian law.</li>
          <li>Misrepresent price data sourced from this site without noting it may be outdated.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">4. Intellectual property</h2>
        <p className="text-cream-dim leading-relaxed">
          Magic: The Gathering card names, set names, artwork, and related content are the
          intellectual property of Wizards of the Coast LLC. Card data is sourced from{" "}
          <a
            href="https://scryfall.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Scryfall
          </a>{" "}
          under their terms. Scrymarket claims no ownership over any MTG intellectual property.
        </p>
        <p className="text-cream-dim leading-relaxed">
          The Scrymarket source code and site design are the work of its author. You may use
          the code under its open-source licence terms if one is published in the repository.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">5. Third-party links</h2>
        <p className="text-cream-dim leading-relaxed">
          The site contains links to retailer product pages and eBay listings. These are
          third-party sites with their own terms of service and privacy policies. Scrymarket
          has no control over their content and accepts no responsibility for them.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">6. Limitation of liability</h2>
        <p className="text-cream-dim leading-relaxed">
          To the maximum extent permitted by law, Scrymarket and its operators shall not be
          liable for any direct, indirect, incidental, or consequential loss arising from your
          use of, or inability to use, this site or any data it displays.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">7. Changes to these terms</h2>
        <p className="text-cream-dim leading-relaxed">
          These terms may be updated at any time. The &ldquo;Last updated&rdquo; date at the top of this
          page reflects when changes were last made. Continued use of the site after a change
          constitutes acceptance of the revised terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">8. Governing law</h2>
        <p className="text-cream-dim leading-relaxed">
          These terms are governed by the laws of Australia. Any disputes will be subject to
          the jurisdiction of Australian courts.
        </p>
      </section>
    </div>
  );
}
