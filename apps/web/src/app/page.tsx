import { searchCards } from "@/lib/db";

// Scryfall stores "normal" size URIs — swap to "small" (146×204) for thumbnails
function toSmallImage(uri: string | null): string | null {
  return uri ? uri.replace("/normal/", "/small/") : null;
}

const MANA_COLORS: Record<string, string> = {
  W: "bg-yellow-100 text-yellow-900",
  U: "bg-blue-500 text-white",
  B: "bg-gray-700 text-white border border-gray-600",
  R: "bg-red-600 text-white",
  G: "bg-green-600 text-white",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await searchCards(query) : [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-100">
        MTG Australian Price Tracker
      </h1>

      {/* Search form */}
      <form method="GET" action="/" className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search cards by name…"
            autoFocus
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      {/* Results */}
      {query && results.length === 0 && (
        <p className="text-gray-400">
          No cards found for &ldquo;{query}&rdquo;.
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500 mb-3">
            {results.length} result{results.length !== 1 ? "s" : ""}
            {results.length === 50 ? " (showing first 50)" : ""}
          </p>

          {results.map((card) => {
            const thumb = toSmallImage(card.image_uri);
            return (
              <a
                key={card.id}
                href={`/cards/${card.id}`}
                className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 hover:border-indigo-700 hover:bg-gray-800/80 transition-colors overflow-hidden"
              >
                {/* Card thumbnail */}
                <div className="shrink-0 w-[52px] h-[72px] bg-gray-800 overflow-hidden rounded-r-sm">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt={card.name}
                      width={52}
                      height={72}
                      className="w-full h-full object-cover object-top"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                      ?
                    </div>
                  )}
                </div>

                {/* Card info */}
                <div className="flex flex-1 items-center justify-between gap-2 pr-4 min-w-0">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-100 truncate">
                      {card.name}
                    </div>
                    <div className="text-sm text-gray-400 truncate">
                      {card.type_line}
                    </div>
                    {/* Colour pips */}
                    <div className="flex gap-1 mt-1">
                      {(card.colors as string[]).length === 0 ? (
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-600 text-[10px] text-gray-300">
                          C
                        </span>
                      ) : (
                        (card.colors as string[]).map((c) => (
                          <span
                            key={c}
                            className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${MANA_COLORS[c] ?? "bg-gray-500 text-white"}`}
                          >
                            {c}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {card.lowest_price ? (
                      <div className="text-green-400 font-medium">
                        from ${parseFloat(card.lowest_price).toFixed(2)}
                      </div>
                    ) : (
                      <div className="text-gray-500 text-sm">no prices</div>
                    )}
                    <div className="text-xs text-gray-500">
                      {card.printing_count} printing
                      {card.printing_count !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {!query && (
        <p className="text-gray-500">
          Search for any Magic: The Gathering card to compare Australian store
          prices.
        </p>
      )}
    </div>
  );
}
