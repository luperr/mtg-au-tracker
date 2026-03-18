import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Disclaimer — Scrymarket",
  description: "Price data disclaimer and limitations of Scrymarket.",
};

export default function DisclaimerPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-cream mb-3">Disclaimer</h1>
        <p className="text-cream-dim text-sm">Last updated: March 2026</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">Prices are informational only</h2>
        <p className="text-cream-dim leading-relaxed">
          All prices displayed on Scrymarket are collected from publicly accessible sources and
          are provided for informational comparison purposes only. Prices may be outdated,
          incomplete, or inaccurate. Scrymarket makes no guarantee that any price shown reflects
          the actual current price at a store or on eBay at the time you are reading it.
        </p>
        <p className="text-cream-dim leading-relaxed">
          Always verify current prices and stock availability directly with the retailer or on
          eBay before making any purchasing decision.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">No affiliation with retailers or WotC</h2>
        <p className="text-cream-dim leading-relaxed">
          Scrymarket is an independent, unofficial tool. It is not affiliated with, endorsed by,
          or in any way connected to Wizards of the Coast LLC, any Australian MTG retailer, or
          eBay Inc. All trademarks remain the property of their respective owners.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">No purchase facilitation</h2>
        <p className="text-cream-dim leading-relaxed">
          Scrymarket does not sell cards, process payments, or act as an intermediary in any
          transaction. Links to store product pages are provided as a convenience only. Any
          purchase you make is solely between you and the relevant retailer or eBay seller.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">Limitation of liability</h2>
        <p className="text-cream-dim leading-relaxed">
          To the fullest extent permitted by law, Scrymarket and its operators accept no
          liability for any loss or damage arising from reliance on price data displayed on this
          site. Use of this site is at your own risk.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-cream">Exchange rate</h2>
        <p className="text-cream-dim leading-relaxed">
          USD reference prices sourced from Scryfall are converted to AUD using a static
          exchange rate and are not real-time. These converted figures are for rough comparison
          only and should not be used as financial guidance.
        </p>
      </section>
    </div>
  );
}
