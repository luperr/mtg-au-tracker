import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ — Scrymarket",
  description: "Frequently asked questions about Scrymarket.",
};

type FaqItem = { q: string; a: React.ReactNode };

const faqs: FaqItem[] = [
  {
    q: "Where does the price data come from?",
    a: (
      <>
        Store prices are scraped directly from Australian retailer websites. eBay prices come
        from the official eBay Browse API. USD reference prices are sourced from{" "}
        <a
          href="https://scryfall.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          Scryfall
        </a>{" "}
        and converted to AUD using a live exchange rate.
      </>
    ),
  },
  {
    q: "How often are prices updated?",
    a: "Store prices and eBay data are refreshed once daily, typically in the early morning (AEST). The exact schedule depends on the hosting environment. The price history chart shows when the most recent snapshot was taken.",
  },
  {
    q: "Why is a card missing from the search results?",
    a: "Card data comes from Scryfall's bulk data export, which is updated daily. If a card was very recently released it may not yet be in Scryfall's database. Tokens, digital-only cards, and promo emblems are intentionally excluded.",
  },
  {
    q: "Why doesn't a store show a price for a card I know they stock?",
    a: "Two things can cause this: (1) the scraper may not have successfully matched the store's listing to the correct Scryfall printing — check the 'unmatched' data if you have DB access; or (2) the card was out of stock at the time of the last scrape and stock filtering is active. Toggle 'In stock only' off in the prices table to see all listings.",
  },
  {
    q: "What does the trend badge (↑ / ↓ / →) mean?",
    a: "The badge compares the current median price to the price from 7 days ago. ↑ means up more than 5%, ↓ means down more than 5%, → means roughly flat. It reflects overall market movement across all tracked stores, not any single retailer.",
  },
  {
    q: "Which Australian stores are tracked?",
    a: "Currently: MTG Mate, Good Games and eBay AU. More stores will be added over time — see the Contact page to request one.",
  },
  {
    q: "Why does the USD reference price look wrong?",
    a: "The USD price comes from Scryfall and is converted to AUD using a live rate from the European Central Bank (via Frankfurter), refreshed approximately every hour. It is intended as a rough reference, not a precise conversion.",
  },
  {
    q: "Can I use this data in my own project?",
    a: (
      <>
        The underlying card data belongs to Wizards of the Coast and is sourced from Scryfall
        under{" "}
        <a
          href="https://scryfall.com/docs/api"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          Scryfall&apos;s API terms
        </a>
        . Store prices are scraped from retailer websites — please respect their terms of
        service before redistributing that data. If Scrymarket&apos;s source code is published,
        check the repository licence.
      </>
    ),
  },
  {
    q: "I found a bug or wrong price. How do I report it?",
    a: (
      <>
        Please visit the{" "}
        <a href="/contact" className="text-accent hover:underline">
          Contact
        </a>{" "}
        page for instructions on how to file a report.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-cream mb-3">Frequently Asked Questions</h1>
      </header>

      <dl className="space-y-6">
        {faqs.map(({ q, a }) => (
          <div key={q} className="border-b border-subtle pb-6 last:border-0">
            <dt className="font-semibold text-cream mb-2">{q}</dt>
            <dd className="text-cream-dim leading-relaxed">{a}</dd>
          </div>
        ))}
      </dl>

      <p className="text-cream-dim text-sm">
        Still have a question?{" "}
        <a href="/contact" className="text-accent hover:underline">
          Get in touch.
        </a>
      </p>
    </div>
  );
}
