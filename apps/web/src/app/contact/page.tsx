import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — Scrymarket",
  description: "Report bugs, missing stores, or wrong prices on Scrymarket.",
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-cream mb-3">Contact & Feedback</h1>
        <p className="text-cream-dim leading-relaxed">
          Scrymarket is a personal project maintained in spare time. There is no support team —
          but feedback is genuinely useful and read.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-cream">Ways to get in touch</h2>

        <div className="bg-surface border border-subtle rounded-lg p-5 space-y-2">
          <p className="font-medium text-cream">Report a bug or wrong price</p>
          <p className="text-cream-dim text-sm leading-relaxed">
            If a card shows an incorrect price, a store link is broken, or the site is behaving
            unexpectedly, please open an issue on GitHub with as much detail as possible —
            card name, set, store, and what you expected vs what you saw.
          </p>
        </div>

        <div className="bg-surface border border-subtle rounded-lg p-5 space-y-2">
          <p className="font-medium text-cream">Request a store be added</p>
          <p className="text-cream-dim text-sm leading-relaxed">
            Know an Australian MTG store that isn&apos;t tracked yet? Open a GitHub issue with
            the store name and URL. Stores need a publicly accessible product listing page to be
            scraped.
          </p>
        </div>

        <div className="bg-surface border border-subtle rounded-lg p-5 space-y-2">
          <p className="font-medium text-cream">General feedback</p>
          <p className="text-cream-dim text-sm leading-relaxed">
            Suggestions for features, UI improvements, or data quality are welcome via GitHub
            Discussions or Issues.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">What to include in a bug report</h2>
        <ul className="list-disc list-inside space-y-1 text-cream-dim leading-relaxed">
          <li>Card name and set (if relevant)</li>
          <li>Store name</li>
          <li>What you expected to see</li>
          <li>What you actually saw</li>
          <li>Your browser and operating system (for UI bugs)</li>
        </ul>
      </section>

      <p className="text-cream-dim text-sm">
        Response times vary. This is a solo side project — please be patient.
      </p>
    </div>
  );
}
