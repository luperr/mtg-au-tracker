import { getCardPriceHistory } from "@/lib/db";
import { PriceChart } from "./PriceChart";

/**
 * The price chart, fetched on its own so it can stream in after the page.
 *
 * getCardPriceHistory() is by far the most expensive query on this route — it is
 * the only one that touches price_history (19GB across monthly partitions) rather
 * than store_prices. Keeping it in the page's blocking Promise.all meant nothing
 * rendered until it finished, which on a cold cache is minutes. Everything above
 * the chart depends only on printings + store_prices, which is ~3ms warm.
 */
export async function PriceChartSection({ cardId }: { cardId: string }) {
  const history = await getCardPriceHistory(cardId);
  return <PriceChart history={history} />;
}

/** Same outer shape as the chart, so streaming it in doesn't shift the layout. */
export function PriceChartSkeleton() {
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-cream-dim/60 uppercase tracking-wider">
          Price History
        </span>
      </div>
      <div
        className="rounded-lg border border-subtle bg-surface overflow-hidden animate-pulse"
        style={{ height: 220 }}
      />
    </div>
  );
}
