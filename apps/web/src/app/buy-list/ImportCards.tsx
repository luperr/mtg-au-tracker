"use client";

import { useState, useRef } from "react";
import { useBuyList } from "@/app/BuyListContext";
import type { BulkLookupResult } from "@/app/api/cards/bulk-lookup/route";

function parseCardList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("#"))
    .map((line) => {
      // Strip leading quantity: "4x ", "4 ", "x4 " etc.
      return line.replace(/^\d+[xX]?\s+/, "").replace(/^[xX]\d+\s+/, "").trim();
    })
    .filter((name) => name.length > 0);
}

export function ImportCards() {
  const { addItem } = useBuyList();
  const [text, setText] = useState("");
  const [results, setResults] = useState<BulkLookupResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport() {
    const names = parseCardList(text);
    if (names.length === 0) {
      setError("No card names found. Enter one card name per line.");
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    setAdded(new Set());

    try {
      const res = await fetch("/api/cards/bulk-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as { results: BulkLookupResult[] };
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function handleAddAll() {
    if (!results) return;
    const newAdded = new Set(added);
    for (const r of results) {
      if (!r.cheapest || !r.cardId || !r.cardName) continue;
      const itemId = `${r.cheapest.printingId}-${r.cheapest.storeName}`;
      if (newAdded.has(itemId)) continue;
      addItem({
        id: itemId,
        cardId: r.cardId,
        cardName: r.cardName,
        printingId: r.cheapest.printingId,
        setName: r.cheapest.setName,
        setCode: r.cheapest.setCode,
        rarity: r.cheapest.rarity,
        isFoil: r.cheapest.isFoil,
        storeName: r.cheapest.storeName,
        priceAud: r.cheapest.priceAud,
        condition: r.cheapest.condition,
        url: r.cheapest.url,
        imageUri: r.imageUri,
      });
      newAdded.add(itemId);
    }
    setAdded(newAdded);
  }

  function handleAddOne(r: BulkLookupResult) {
    if (!r.cheapest || !r.cardId || !r.cardName) return;
    const itemId = `${r.cheapest.printingId}-${r.cheapest.storeName}`;
    addItem({
      id: itemId,
      cardId: r.cardId,
      cardName: r.cardName,
      printingId: r.cheapest.printingId,
      setName: r.cheapest.setName,
      setCode: r.cheapest.setCode,
      rarity: r.cheapest.rarity,
      isFoil: r.cheapest.isFoil,
      storeName: r.cheapest.storeName,
      priceAud: r.cheapest.priceAud,
      condition: r.cheapest.condition,
      url: r.cheapest.url,
      imageUri: r.imageUri,
    });
    setAdded((prev) => new Set([...prev, itemId]));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setText(ev.target?.result as string ?? "");
    };
    reader.readAsText(file);
  }

  const found = results?.filter((r) => r.cheapest) ?? [];
  const notFound = results?.filter((r) => !r.cheapest) ?? [];
  const allAdded = found.length > 0 && found.every((r) => r.cheapest && added.has(`${r.cheapest.printingId}-${r.cheapest.storeName}`));

  return (
    <div className="rounded-lg border border-subtle bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-subtle bg-cream-muted">
        <h2 className="font-semibold text-cream text-sm">Import from text</h2>
        <p className="text-xs text-cream-dim/50 mt-0.5">
          Paste a card list (one per line). Quantities like &quot;4x&quot; are stripped automatically.
        </p>
      </div>

      <div className="p-4 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Lightning Bolt\n4x Counterspell\n2x Black Lotus"}
          rows={6}
          className="w-full rounded-lg border border-subtle bg-bg text-cream text-sm px-3 py-2 resize-y placeholder:text-cream-dim/25 focus:outline-none focus:border-accent-border"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={loading || !text.trim()}
            className="rounded-lg bg-price text-bg px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {loading ? "Looking up…" : "Look up prices"}
          </button>

          <label className="rounded-lg border border-subtle bg-muted px-3 py-2 text-xs text-cream-dim hover:text-cream hover:border-accent-border transition-colors cursor-pointer">
            Upload .txt file
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,text/plain"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          {text && (
            <button
              onClick={() => { setText(""); setResults(null); setError(null); }}
              className="text-xs text-cream-dim/30 hover:text-cream-dim transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>

      {results && (
        <div className="border-t border-subtle">
          {/* Summary bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-cream-muted border-b border-subtle/50">
            <span className="text-xs text-cream-dim/60">
              {found.length} found · {notFound.length} not found
              {found.length > 0 && (
                <> · Total: <span className="text-price font-semibold">
                  ${found.reduce((s: number, r: BulkLookupResult) => s + (r.cheapest?.priceAud ?? 0), 0).toFixed(2)} AUD
                </span></>
              )}
            </span>
            {found.length > 0 && (
              <button
                onClick={handleAddAll}
                disabled={allAdded}
                className="text-xs font-medium text-price hover:text-cream transition-colors disabled:opacity-40 disabled:cursor-default"
              >
                {allAdded ? "All added ✓" : "Add all cheapest"}
              </button>
            )}
          </div>

          {/* Results table */}
          {found.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs bg-cream-muted border-b border-subtle/50">
                  <th className="px-4 py-2 text-left font-medium text-cream-dim">Card</th>
                  <th className="px-3 py-2 text-left font-medium text-cream-dim">Cheapest store</th>
                  <th className="px-3 py-2 text-right font-medium text-cream-dim">Price AUD</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {found.map((r: BulkLookupResult) => {
                  const itemId = r.cheapest ? `${r.cheapest.printingId}-${r.cheapest.storeName}` : "";
                  const isAdded = added.has(itemId);
                  return (
                    <tr key={r.inputName} className="border-b border-subtle/40 last:border-0 hover:bg-muted transition-colors">
                      <td className="px-4 py-2.5">
                        <a href={`/cards/${r.cardId}`} className="font-medium text-cream hover:text-accent transition-colors">
                          {r.cardName}
                        </a>
                        {r.cardName !== r.inputName && (
                          <div className="text-[10px] text-cream-dim/40 mt-0.5">searched: {r.inputName}</div>
                        )}
                        {r.cheapest && (
                          <div className="text-xs text-cream-dim/50 mt-0.5">
                            {r.cheapest.setName}{r.cheapest.isFoil ? " ✦" : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-cream-dim">{r.cheapest?.storeName}</td>
                      <td className="px-3 py-2.5 text-right text-price font-semibold">
                        ${r.cheapest?.priceAud.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => isAdded ? undefined : handleAddOne(r)}
                          disabled={isAdded}
                          className={`w-6 h-6 rounded flex items-center justify-center text-sm transition-colors ml-auto ${
                            isAdded
                              ? "bg-price/20 text-price cursor-default"
                              : "bg-muted text-cream-dim/40 hover:bg-price/20 hover:text-price"
                          }`}
                        >
                          {isAdded ? "✓" : "+"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Not found */}
          {notFound.length > 0 && (
            <div className="px-4 py-3 border-t border-subtle/40">
              <p className="text-xs text-cream-dim/40 mb-1.5">Not found in database:</p>
              <div className="flex flex-wrap gap-1.5">
                {notFound.map((r) => (
                  <span key={r.inputName} className="rounded bg-muted px-2 py-0.5 text-xs text-cream-dim/40">
                    {r.inputName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
