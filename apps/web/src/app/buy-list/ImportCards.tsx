"use client";

import { useState, useRef } from "react";
import { useBuyList } from "@/app/BuyListContext";
import type { BulkLookupResult, BulkLookupInput } from "@/app/api/cards/bulk-lookup/route";

/**
 * Parse a card list in any of these formats:
 *   1 Card Name (SET) 123          ← MTGO/Arena export with set + collector number
 *   1 Card Name (SET) 123 #!Tag    ← same with Arena tags (ignored)
 *   4x Counterspell                ← plain name with quantity prefix
 *   Counterspell                   ← plain name, no quantity
 *
 * Lines starting with // or # (before the card name) are treated as comments.
 */
function parseCardList(text: string): BulkLookupInput[] {
  const results: BulkLookupInput[] = [];

  for (const raw of text.split("\n")) {
    // Detect tab-separated store export format:
    //   [tab]Card Name · Foil/Nonfoil[tab]Set Name[tab]Qty[tab][tab]$price...
    // Identified by having a tab AND a " · Foil" / " · Nonfoil" marker.
    if (raw.includes("\t") && /·\s*(Non)?[Ff]oil/i.test(raw)) {
      const fields = raw.split("\t");
      // Card name is in the first non-empty field
      const nameField = fields.find((f) => f.trim().length > 0) ?? "";
      // Strip the "· Nonfoil" / "· Foil" suffix
      let name = nameField.replace(/\s*·\s*(Non)?[Ff]oil\b.*/i, "").trim();
      // Strip parenthetical variant notes like "(Showcase 349)" — not part of the canonical name
      name = name.replace(/\s*\(\D[^)]*\)\s*$/, "").trim();
      if (name) results.push({ name, qty: 1 });
      continue;
    }

    // Strip inline Arena tags (#!Tag) and trailing whitespace
    const line = raw.replace(/#.*$/, "").trim();
    if (!line || line.startsWith("//")) continue;

    // MTGO/Arena format: {qty} {Name} ({SET}) {collector}
    const full = line.match(/^(\d+)\s+(.+?)\s+\(([A-Z0-9]+)\)\s+(\d+[a-z]?)\s*$/i);
    if (full) {
      results.push({
        name: full[2].trim(),
        setCode: full[3].toLowerCase(),
        collectorNumber: full[4],
        qty: Math.min(parseInt(full[1], 10), 99),
      });
      continue;
    }

    // {qty} {Name} ({SET}) — set but no collector number
    const withSet = line.match(/^(\d+)\s+(.+?)\s+\(([A-Z0-9]+)\)\s*$/i);
    if (withSet) {
      results.push({
        name: withSet[2].trim(),
        setCode: withSet[3].toLowerCase(),
        qty: Math.min(parseInt(withSet[1], 10), 99),
      });
      continue;
    }

    // Plain: {qty} {Name}  or  {qty}x {Name}  or  x{qty} {Name}
    const plain = line.match(/^(\d+)[xX]?\s+(.+)$/) ?? line.match(/^[xX](\d+)\s+(.+)$/);
    if (plain) {
      results.push({ name: plain[2].trim(), qty: Math.min(parseInt(plain[1], 10), 99) });
      continue;
    }

    // No quantity prefix — treat as single copy
    if (line.length > 0) {
      results.push({ name: line, qty: 1 });
    }
  }

  return results.filter((c) => c.name.length > 0);
}

export function ImportCards() {
  const { addItem } = useBuyList();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<BulkLookupInput[]>([]);
  const [results, setResults] = useState<BulkLookupResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport() {
    const cards = parseCardList(text);
    if (cards.length === 0) {
      setError("No card names found. Enter one card name per line.");
      return;
    }
    setParsed(cards);
    setLoading(true);
    setError(null);
    setResults(null);
    setAdded(new Set());

    try {
      const res = await fetch("/api/cards/bulk-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards }),
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
        storeId: r.cheapest.storeId ?? "",
        storeName: r.cheapest.storeName,
        priceAud: r.cheapest.priceAud,
        shippingAud: r.cheapest.shippingAud ?? null,
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
      storeId: r.cheapest.storeId ?? "",
      storeName: r.cheapest.storeName,
      priceAud: r.cheapest.priceAud,
      shippingAud: r.cheapest.shippingAud ?? null,
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
      setExpanded(true);   // auto-expand so the user sees the loaded content
      setResults(null);
      setError(null);
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  const found = results?.filter((r) => r.cheapest) ?? [];
  const notFound = results?.filter((r) => !r.cheapest) ?? [];
  const allAdded = found.length > 0 && found.every((r) => r.cheapest && added.has(`${r.cheapest.printingId}-${r.cheapest.storeName}`));

  return (
    <div className="rounded-lg border border-subtle bg-surface overflow-hidden">
      {/* Header — always visible */}
      <div className="px-4 py-3 border-b border-subtle bg-cream-muted flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-cream text-sm">Import from list</h2>
          <p className="text-xs text-cream-dim/50 mt-0.5">
            Paste a card list or upload a .txt file. Supports MTGO/Arena export format (set code + collector number = exact match). Arena tags like #!Land are ignored.
          </p>
        </div>

        {/* Controls always visible */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <label className="rounded-lg border border-subtle bg-muted px-3 py-1.5 text-xs text-cream-dim hover:text-cream hover:border-accent-border transition-colors cursor-pointer whitespace-nowrap">
            Upload .txt
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,text/plain"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg border border-subtle bg-muted px-3 py-1.5 text-xs text-cream-dim hover:text-cream hover:border-accent-border transition-colors whitespace-nowrap"
          >
            {expanded ? "Collapse ▲" : "Paste list ▼"}
          </button>
        </div>
      </div>

      {/* Collapsible paste area */}
      {expanded && (
        <div className="p-4 space-y-3 border-b border-subtle">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"1 Lightning Bolt (M11) 146\n4x Counterspell\n9 Forest (EOE) 275 #!Land"}
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
      )}

      {/* Results — always visible once loaded */}
      {results && (
        <div>
          {/* Summary bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-cream-muted border-b border-subtle/50">
            <span className="text-xs text-cream-dim/60">
              {found.length} found · {notFound.length} not found
              {found.length > 0 && (
                <> · Total: <span className="text-price font-semibold">
                  {found.reduce((s: number, r: BulkLookupResult) => s + (r.cheapest?.priceAud ?? 0), 0).toFixed(2) === "0.00"
                    ? "—"
                    : `$${found.reduce((s: number, r: BulkLookupResult) => s + (r.cheapest?.priceAud ?? 0), 0).toFixed(2)}`
                  } AUD
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
                        <div className="flex items-baseline gap-1.5">
                          {r.qty > 1 && (
                            <span className="text-xs text-cream-dim/50 font-medium shrink-0">{r.qty}×</span>
                          )}
                          <a href={`/cards/${r.cardId}`} className="font-medium text-cream hover:text-accent transition-colors">
                            {r.cardName}
                          </a>
                        </div>
                        {r.cardName !== r.inputName && (
                          <div className="text-[10px] text-cream-dim/40 mt-0.5">searched: {r.inputName}</div>
                        )}
                        {r.cheapest && (
                          <div className="text-xs text-cream-dim/50 mt-0.5">
                            {r.cheapest.setName.toUpperCase()} #{parsed.find(p => p.name === r.inputName)?.collectorNumber ?? ""}{r.cheapest.isFoil ? " ✦" : ""}
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
