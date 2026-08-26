import { getCardPriceHistory } from "@/lib/db";
import { PriceChart } from "./PriceChart";

/**
 * The price chart, fetched on its own so it can stream in after the page.
 *
 * getCardPriceHistory() is the most expensive query on this route — it is the only
 * one that leaves printings + store_prices, reading the set_card_daily pre-aggregate
 * instead. Keeping it in the page's blocking Promise.all meant nothing rendered until
 * it finished, which when it still scanned price_history directly was minutes on a
 * cold cache. Everything above the chart is ~3ms warm, so it should never wait.
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
