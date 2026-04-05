export const revalidate = 3600; // revalidate at most once per hour; prices update at 5 AM daily

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCard, getCardMetadata, getPrintingsWithPrices, getCardTrend, getCardPriceHistory, type PrintingWithPrices } from "@/lib/db";
import { getAudPerUsd } from "@/lib/exchange-rate";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await getCardMetadata(slug);
  if (!meta) return { title: "Card not found | Scrymarket" };

  const priceStr = meta.cheapest_price
    ? `$${parseFloat(meta.cheapest_price).toFixed(2)} AUD`
    : null;

  // Keep title under 60 chars: truncate card name if needed
  const maxNameLen = priceStr ? 45 : 38;
  const displayName = meta.name.length > maxNameLen
    ? meta.name.slice(0, maxNameLen - 1) + "…"
    : meta.name;

  const title = priceStr
    ? `${displayName} — From ${priceStr} | Scrymarket`
    : `${displayName} — AU Price Tracker | Scrymarket`;

  const description = meta.store_count > 0
    ? `Compare ${meta.name} prices across ${meta.store_count} Australian MTG stores. Currently from ${priceStr} at ${meta.cheapest_store}. Price history & eBay AU data.`
    : `Track ${meta.name} prices across Australian MTG stores and eBay AU. ${meta.type_line}.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug } = await params;

  const card = await getCard(slug);
  if (!card) notFound();

  const [rawPrintings, trend, history, audPerUsd] = await Promise.all([
    getPrintingsWithPrices(card.id),
    getCardTrend(card.id),
    getCardPriceHistory(card.id),
    getAudPerUsd(),
  ]);

  const printings = sortPrintings(rawPrintings);

  // Compute price stats for JSON-LD structured data
  const allInStockPrices = printings
    .flatMap((p) => p.prices.filter((pr) => pr.inStock).map((pr) => parseFloat(pr.priceAud)));
  const inStockStores = new Set(
    printings.flatMap((p) => p.prices.filter((pr) => pr.inStock).map((pr) => pr.storeId))
  );
  const cheapestPrice = allInStockPrices.length > 0 ? Math.min(...allInStockPrices) : null;
  const highestPrice = allInStockPrices.length > 0 ? Math.max(...allInStockPrices) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: card!.name,
    description: `${card!.name} — Magic: The Gathering. Compare prices across ${inStockStores.size} Australian stores.`,
    brand: { "@type": "Brand", name: "Magic: The Gathering" },
    ...(cheapestPrice !== null && {
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "AUD",
        lowPrice: cheapestPrice.toFixed(2),
        highPrice: highestPrice!.toFixed(2),
        offerCount: allInStockPrices.length,
        availability: "https://schema.org/InStock",
      },
    }),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <a
        href="/"
        className="mb-5 inline-flex items-center gap-1 text-sm text-accent hover:text-accent-light transition-colors"
      >
        ← Back to search
      </a>
      <CardDetailView card={card!} printings={printings} trend={trend} history={history} audPerUsd={audPerUsd} />
    </div>
  );
}
