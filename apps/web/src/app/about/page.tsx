import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Scrymarket",
  description: "What Scrymarket is, how it works, and who built it.",
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-10">
      <header>
        <h1 className="text-3xl font-bold text-cream mb-3">About Scrymarket</h1>
        <p className="text-cream-dim leading-relaxed">
          Scrymarket is a free, self-hosted price tracker for Magic: The Gathering singles,
          focused on the Australian market. It lets you compare what local stores are charging
           all in AUD, without the conversion guesswork.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">How it works</h2>
        <ol className="list-decimal list-inside space-y-2 text-cream-dim leading-relaxed">
          <li>
            Card and printing data is imported daily from the{" "}
            <a
              href="https://scryfall.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Scryfall
            </a>{" "}
            bulk data API — the authoritative database for every MTG printing ever released.
          </li>
          <li>
            Australian store prices are scraped from retailer websites and matched to specific
            printings using card name, set, and foil status.
          </li>
          <li>
            eBay AU listings are fetched via the eBay Browse API and parsed to extract card
            details and recent sold prices.
          </li>
          <li>
            All prices are stored in AUD. USD reference prices from Scryfall are converted
            using a live exchange rate from the European Central Bank, refreshed hourly.
          </li>
          <li>
            A daily snapshot is saved so you can see how prices
            trend over time. Using actual australian prices.
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">Data sources & attributions</h2>
        <div className="space-y-4 text-cream-dim leading-relaxed">
          <div className="border-l-2 border-accent-border pl-4">
            <p className="font-medium text-cream">
              <a
                href="https://scryfall.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Scryfall
              </a>
            </p>
            <p>
              Card names, set data, artwork images, mana cost symbols, and USD reference prices
              are provided by Scryfall&apos;s free bulk data API and image CDN. Scryfall is an
              independent MTG card database. All card data remains the intellectual property of
              Wizards of the Coast.
            </p>
          </div>
          <div className="border-l-2 border-accent-border pl-4">
            <p className="font-medium text-cream">Australian MTG Retailers</p>
            <p>
              Store prices are scraped from publicly accessible product pages. Scrymarket has no
              commercial relationship with any retailer. Price data is provided for informational
              comparison only — always verify current prices and availability directly with the
              store before purchasing.
            </p>
          </div>
          <div className="border-l-2 border-accent-border pl-4">
            <p className="font-medium text-cream">
              <a
                href="https://developer.ebay.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                eBay Australia
              </a>
            </p>
            <p>
              eBay listing data is retrieved via the official eBay Browse API. Scrymarket is not
              affiliated with eBay Inc. eBay and the eBay logo are trademarks of eBay Inc.
            </p>
          </div>
          <div className="border-l-2 border-accent-border pl-4">
            <p className="font-medium text-cream">Wizards of the Coast</p>
            <p>
              Magic: The Gathering, all card names, set names, and related imagery are the
              intellectual property of Wizards of the Coast LLC. Scrymarket is an unofficial fan
              tool and is not produced by, endorsed by, or affiliated with Wizards of the Coast.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">Open source</h2>
        <p className="text-cream-dim leading-relaxed">
          Scrymarket is a personal project built with Next.js, PostgreSQL, and Drizzle ORM.
          It is self-hosted and not a commercial product. No user data is collected.
        </p>
      </section>
    </div>
  );
}
