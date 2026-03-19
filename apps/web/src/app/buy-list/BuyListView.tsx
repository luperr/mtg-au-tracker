"use client";

import { useBuyList, type BuyListItem } from "@/app/BuyListContext";
import { ImportCards } from "./ImportCards";

function groupByStore(items: BuyListItem[]): Map<string, BuyListItem[]> {
  const map = new Map<string, BuyListItem[]>();
  for (const item of items) {
    const group = map.get(item.storeName) ?? [];
    group.push(item);
    map.set(item.storeName, group);
  }
  return map;
}

export function BuyListView() {
  const { items, removeItem, clearAll, totalCount, totalPrice } = useBuyList();
  const byStore = groupByStore(items);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cream">Buy List</h1>
          {totalCount > 0 && (
            <p className="text-sm text-cream-dim/60 mt-0.5">
              {totalCount} item{totalCount !== 1 ? "s" : ""} · Total:{" "}
              <span className="text-price font-semibold">${totalPrice.toFixed(2)} AUD</span>
            </p>
          )}
        </div>
        {totalCount > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-cream-dim/40 hover:text-red-400 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {totalCount === 0 ? (
        <div className="rounded-lg border border-subtle bg-surface px-6 py-12 text-center mb-8">
          <p className="text-cream-dim/50 mb-2">Your buy list is empty.</p>
          <p className="text-xs text-cream-dim/30">
            Browse cards and click <span className="text-price">+</span> on any price row to add it here.
          </p>
        </div>
      ) : (
        <div className="space-y-6 mb-8">
          {Array.from(byStore.entries()).map(([storeName, storeItems]) => {
            const storeTotal = storeItems.reduce((s, i) => s + i.priceAud, 0);
            return (
              <div key={storeName} className="rounded-lg border border-subtle bg-surface overflow-hidden">
                {/* Store header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-cream-muted border-b border-subtle">
                  <span className="font-semibold text-cream text-sm">{storeName}</span>
                  <span className="text-price font-semibold text-sm">${storeTotal.toFixed(2)} AUD</span>
                </div>

                <table className="w-full text-sm">
                  <tbody>
                    {storeItems.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-subtle/60 last:border-0 hover:bg-muted transition-colors"
                      >
                        {/* Thumbnail */}
                        <td className="pl-3 py-2 w-8">
                          {item.imageUri ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUri}
                              alt={item.cardName}
                              width={28}
                              height={39}
                              className="rounded"
                              style={{ aspectRatio: "63/88", objectFit: "cover" }}
                            />
                          ) : (
                            <div
                              className="rounded bg-muted border border-subtle"
                              style={{ width: 28, height: 39 }}
                            />
                          )}
                        </td>

                        {/* Card name + set */}
                        <td className="px-3 py-2">
                          <a
                            href={`/cards/${item.cardId}`}
                            className="font-medium text-cream hover:text-accent transition-colors"
                          >
                            {item.cardName}
                          </a>
                          <div className="text-xs text-cream-dim/50 mt-0.5">
                            {item.setName}{item.isFoil ? " ✦" : ""}
                            {item.condition ? ` · ${item.condition}` : ""}
                          </div>
                        </td>

                        {/* Price */}
                        <td className="px-3 py-2 text-right text-price font-semibold whitespace-nowrap">
                          ${item.priceAud.toFixed(2)}
                        </td>

                        {/* Store link */}
                        <td className="px-2 py-2 text-right">
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-price hover:text-cream transition-colors"
                            >
                              Buy ↗
                            </a>
                          )}
                        </td>

                        {/* Remove */}
                        <td className="pr-3 py-2 text-right">
                          <button
                            onClick={() => removeItem(item.id)}
                            title="Remove"
                            className="w-5 h-5 rounded flex items-center justify-center text-cream-dim/30 hover:text-red-400 hover:bg-red-900/20 transition-colors ml-auto"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Grand total */}
          <div className="flex justify-end">
            <div className="rounded-lg border border-subtle bg-surface px-5 py-3 text-sm">
              <span className="text-cream-dim/60 mr-3">Grand total</span>
              <span className="text-price font-bold text-base">${totalPrice.toFixed(2)} AUD</span>
            </div>
          </div>
        </div>
      )}

      {/* Import section */}
      <ImportCards />
    </div>
  );
}
