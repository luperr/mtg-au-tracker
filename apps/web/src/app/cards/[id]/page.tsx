import { notFound } from "next/navigation";
import { getCard, getPrintingsWithPrices, type PrintingWithPrices } from "@/lib/db";
import { PrintingSidebar } from "./PrintingSidebar";

const RARITY_BADGE: Record<string, string> = {
  common: "bg-subtle text-cream-dim",
  uncommon: "bg-subtle text-cream",
  rare: "bg-yellow-900/60 text-yellow-400",
  mythic: "bg-orange-900/60 text-price",
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
    if (aMin !== null && bMin === null) return -1;
    if (aMin === null && bMin !== null) return 1;
    if (aMin !== null && bMin !== null) return aMin - bMin;
    return a.setName.localeCompare(b.setName);
  });
}

function CardImage({ uri, name }: { uri: string | null; name: string }) {
  if (!uri) {
    return (
      <div className="aspect-[63/88] w-full rounded-xl bg-muted border border-subtle flex items-center justify-center text-cream-dim/50 text-sm">
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

  const printings = sortPrintings(rawPrintings);

  const selected =
    (selectedId ? printings.find((p) => p.id === selectedId) : undefined) ??
    printings[0];

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
        className="mb-5 inline-flex items-center gap-1 text-sm text-accent hover:text-accent-light transition-colors"
      >
        ← Back to search
      </a>

      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 lg:items-start">

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-4">
          <div className="max-w-[200px] mx-auto lg:max-w-none mb-4">
            <CardImage uri={selected?.imageUri ?? null} name={card.name} />
          </div>
          <PrintingSidebar printings={printings} selectedId={selected?.id} />
        </div>

        {/* ── Right column ────────────────────────────────────────────────── */}
        <div className="mt-6 lg:mt-0">
          {/* Card name + meta */}
          <div className="mb-5">
            <h1 className="text-3xl font-bold text-cream">{card.name}</h1>
            {card.mana_cost && (
              <p className="mt-1 text-cream-dim font-mono">{card.mana_cost}</p>
            )}
            <p className="mt-1 text-cream-dim">{card.type_line}</p>
          </div>

          {/* Oracle text */}
          {card.oracle_text && (
            <div className="mb-5 rounded-lg border border-subtle bg-surface px-4 py-3">
              <p className="whitespace-pre-wrap text-sm text-cream-dim leading-relaxed italic">
                {card.oracle_text}
              </p>
            </div>
          )}

          {/* Selected printing info */}
          {selected && (
            <>
              <div className="mb-3 flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-semibold text-cream">
                  {selected.setName}
                </h2>
                <span className="text-sm text-cream-dim/60">
                  #{selected.collectorNumber}
                </span>
                {selected.isFoil && (
                  <span className="text-sm text-accent font-medium">
                    ✦ Foil
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${RARITY_BADGE[selected.rarity] ?? "bg-muted text-cream-dim"}`}
                >
                  {selected.rarity}
                </span>
                {selected.usdPrice && (
                  <span className="text-xs text-cream-dim/60">
                    USD ${selected.usdPrice}
                  </span>
                )}
                <a
                  href={selected.scryfallUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:text-accent-light ml-auto"
                >
                  View on Scryfall ↗
                </a>
              </div>

              {sortedPrices.length === 0 ? (
                <div className="rounded-lg border border-subtle bg-surface px-4 py-8 text-center text-cream-dim/50">
                  No prices available for this printing
                </div>
              ) : (
                <div className="rounded-lg border border-subtle bg-surface overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-cream-dim/60 bg-cream-muted border-b border-subtle">
                        <th className="px-4 py-2.5 text-left font-medium">Store</th>
                        <th className="px-4 py-2.5 text-left font-medium">Condition</th>
                        <th className="px-4 py-2.5 text-right font-medium">Price (AUD)</th>
                        <th className="px-4 py-2.5 text-center font-medium">Stock</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPrices.map((price, i) => (
                        <tr
                          key={i}
                          className="border-b border-subtle/60 last:border-0 hover:bg-muted transition-colors"
                        >
                          <td className="px-4 py-3 text-cream font-medium">
                            {price.storeName}
                          </td>
                          <td className="px-4 py-3 text-cream-dim">
                            {price.condition ?? "NM"}
                          </td>
                          <td className="px-4 py-3 text-right text-price font-semibold">
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
                                className="text-price hover:text-cream text-sm transition-colors"
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
