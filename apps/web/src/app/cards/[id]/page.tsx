import { notFound } from "next/navigation";
import { getCard, getPrintingsWithPrices, getCardTrend, getCardPriceHistory, type PrintingWithPrices } from "@/lib/db";
import { CardDetailView } from "./CardDetailView";

function sortPrintings(printings: PrintingWithPrices[]): PrintingWithPrices[] {
  return [...printings].sort((a, b) => {
    const aMin = lowestInStockPrice(a);
    const bMin = lowestInStockPrice(b);
    if (aMin !== null && bMin === null) return -1;
    if (aMin === null && bMin !== null) return 1;
    if (aMin !== null && bMin !== null) return aMin - bMin;
    return a.setName.localeCompare(b.setName);
  });
}

function lowestInStockPrice(printing: PrintingWithPrices): number | null {
  const inStock = printing.prices.filter((p) => p.inStock);
  if (inStock.length === 0) return null;
  return Math.min(...inStock.map((p) => parseFloat(p.priceAud)));
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;

  const [card, rawPrintings, trend, history] = await Promise.all([
    getCard(id),
    getPrintingsWithPrices(id),
    getCardTrend(id),
    getCardPriceHistory(id),
  ]);

  if (!card) notFound();

  const printings = sortPrintings(rawPrintings);

  return (
    <div>
      <a
        href="/"
        className="mb-5 inline-flex items-center gap-1 text-sm text-accent hover:text-accent-light transition-colors"
      >
        ← Back to search
      </a>
      <CardDetailView card={card!} printings={printings} trend={trend} history={history} />
    </div>
  );
}
