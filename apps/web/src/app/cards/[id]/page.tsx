import { notFound } from "next/navigation";
import { getCard, getPrintingsWithPrices, type PrintingWithPrices } from "@/lib/db";
import { PrintingSidebar } from "./PrintingSidebar";

const RARITY_BADGE: Record<string, string> = {
  common: "bg-gray-700 text-gray-300",
  uncommon: "bg-slate-600 text-slate-200",
  rare: "bg-yellow-900/60 text-yellow-400",
  mythic: "bg-orange-900/60 text-orange-400",
};

function lowestInStockPrice(printing: PrintingWithPrices): number | null {
  const inStock = printing.prices.filter((p) => p.inStock);
  if (inStock.length === 0) return null;
  return Math.min(...inStock.map((p) => parseFloat(p.priceAud)));
}

function sortPrintings(printings: PrintingWithPrices[]): PrintingWithPrices[] {
  return [...printings].sort((a, b) => {
    const aMin = lowestInStockPrice(a);
    const bMin = lowestInStockPrice(b);
    // Printings with in-stock prices first
    if (aMin !== null && bMin === null) return -1;
    if (aMin === null && bMin !== null) return 1;
    // Both have prices → sort cheapest first
    if (aMin !== null && bMin !== null) return aMin - bMin;
    // Both no prices → alphabetical by set name
    return a.setName.localeCompare(b.setName);
  });
}

function CardImage({ uri, name }: { uri: string | null; name: string }) {
  if (!uri) {
    return (
      <div className="aspect-[63/88] w-full rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-500 text-sm">
        No image
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={uri}
      alt={name}
      className="w-full rounded-xl shadow-2xl shadow-black/60"
      style={{ aspectRatio: "63/88", objectFit: "cover" }}
    />
  );
}

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ printing?: string }>;
}) {
  const { id } = await params;
  const { printing: selectedId } = await searchParams;

  const [card, rawPrintings] = await Promise.all([
    getCard(id),
    getPrintingsWithPrices(id),
  ]);

  if (!card) notFound();

  // Sort so in-stock printings (cheapest first) appear at the top of the sidebar
  const printings = sortPrintings(rawPrintings);

  // Resolve selected printing: URL param → first with in-stock price → first overall
  const selected =
    (selectedId ? printings.find((p) => p.id === selectedId) : undefined) ??
    printings[0];

  // Sort selected printing's prices: in-stock first, then cheapest
  const sortedPrices = selected
    ? [...selected.prices].sort((a, b) => {
        if (a.inStock && !b.inStock) return -1;
        if (!a.inStock && b.inStock) return 1;
        return parseFloat(a.priceAud) - parseFloat(b.priceAud);
      })
    : [];

  return (
    <div>
      {/* Back link */}
      <a
        href="/"
        className="mb-5 inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        ← Back to search
      </a>

      {/*
       * Desktop: two-column grid — left sticky (image + printing list), right (info + prices)
       * Mobile: stacked
       */}
      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 lg:items-start">

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-4">
          {/* Card image for selected printing */}
          <div className="max-w-[200px] mx-auto lg:max-w-none mb-4">
            <CardImage uri={selected?.imageUri ?? null} name={card.name} />
          </div>

          {/* Filterable printings sidebar (client component) */}
          <PrintingSidebar printings={printings} selectedId={selected?.id} />
        </div>

        {/* ── Right column ────────────────────────────────────────────────── */}
        <div className="mt-6 lg:mt-0">
          {/* Card name + meta */}
          <div className="mb-5">
            <h1 className="text-3xl font-bold text-gray-100">{card.name}</h1>
            {card.mana_cost && (
              <p className="mt-1 text-gray-400 font-mono">{card.mana_cost}</p>
            )}
            <p className="mt-1 text-gray-300">{card.type_line}</p>
          </div>

          {/* Oracle text */}
          {card.oracle_text && (
            <div className="mb-5 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed italic">
                {card.oracle_text}
              </p>
            </div>
          )}

          {/* Selected printing info */}
          {selected && (
            <>
              <div className="mb-3 flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-semibold text-gray-100">
                  {selected.setName}
                </h2>
                <span className="text-sm text-gray-500">
                  #{selected.collectorNumber}
                </span>
                {selected.isFoil && (
                  <span className="text-sm text-indigo-400 font-medium">
                    ✦ Foil
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${RARITY_BADGE[selected.rarity] ?? "bg-gray-700 text-gray-400"}`}
                >
                  {selected.rarity}
                </span>
                {selected.usdPrice && (
                  <span className="text-xs text-gray-500">
                    USD ${selected.usdPrice}
                  </span>
                )}
                <a
                  href={selected.scryfallUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 ml-auto"
                >
                  View on Scryfall ↗
                </a>
              </div>

              {/* Prices — only for the selected printing, in-stock first then cheapest */}
              {sortedPrices.length === 0 ? (
                <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-8 text-center text-gray-500">
                  No prices available for this printing
                </div>
              ) : (
                <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 bg-gray-950/50 border-b border-gray-800">
                        <th className="px-4 py-2.5 text-left font-medium">
                          Store
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium">
                          Condition
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          Price (AUD)
                        </th>
                        <th className="px-4 py-2.5 text-center font-medium">
                          Stock
                        </th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPrices.map((price, i) => (
                        <tr
                          key={i}
                          className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/40 transition-colors"
                        >
                          <td className="px-4 py-3 text-gray-200 font-medium">
                            {price.storeName}
                          </td>
                          <td className="px-4 py-3 text-gray-400">
                            {price.condition ?? "NM"}
                          </td>
                          <td className="px-4 py-3 text-right text-green-400 font-semibold">
                            ${parseFloat(price.priceAud).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                price.inStock
                                  ? "bg-green-900/50 text-green-400"
                                  : "bg-red-900/50 text-red-400"
                              }`}
                            >
                              {price.inStock ? "In stock" : "Out"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {price.url && (
                              <a
                                href={price.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-400 hover:text-indigo-300 text-sm"
                              >
                                Buy ↗
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
