export const revalidate = 3600;

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCard, getCardMetadata, getPrintingsWithPrices, getCardTrend, type PrintingWithPrices } from "@/lib/db";
import { getAudPerUsd } from "@/lib/exchange-rate";
import { CardDetailView } from "./CardDetailView";
import { PriceChartSection, PriceChartSkeleton } from "./PriceChartSection";
import { CardBreadcrumb } from "@/app/CardBreadcrumb";
import { Breadcrumb } from "@/app/Breadcrumb";
import { defaultPrintingImage } from "@/lib/card-image";
import { SITE_URL } from "@/lib/config";

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
}) {
  const { slug } = await params;

  const card = await getCard(slug);
  if (!card) notFound();

  // getCardPriceHistory is deliberately NOT awaited here. It is the only query on
  // this route that reads price_history (19GB, monthly partitions) instead of
  // card_listings, and on a cold cache it costs tens of seconds — measured at 58s
  // for Sol Ring. Everything below renders from printings + card_listings, which is
  // ~3ms warm, so the chart streams in afterwards rather than holding the page.
  const [rawPrintings, trend, audPerUsd] = await Promise.all([
    getPrintingsWithPrices(card.id),
    getCardTrend(card.id),
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

  // Scryfall's own URL, not our proxy: robots.txt disallows /api/, and Googlebot fetching
  // the 488px original direct is as fast as it gets. The page's no-hotlinking rule is about
  // what viewers download, which this isn't.
  const image = defaultPrintingImage(printings);
  // The slug, not the request param: getCard also resolves a card by id.
  const url = `${SITE_URL}/cards/${card!.slug ?? card!.id}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: card!.name,
    url,
    ...(image && { image }),
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
        url,
      },
    }),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Suspense fallback={<Breadcrumb items={[{ label: "Search", href: "/" }, { label: card!.name }]} />}>
        <CardBreadcrumb cardName={card!.name} />
      </Suspense>
      <CardDetailView
        card={card!}
        cardSlug={slug}
        printings={printings}
        trend={trend}
        audPerUsd={audPerUsd}
        chart={
          <Suspense key="price-chart" fallback={<PriceChartSkeleton />}>
            <PriceChartSection cardId={card!.id} />
          </Suspense>
        }
      />
    </div>
  );
}
