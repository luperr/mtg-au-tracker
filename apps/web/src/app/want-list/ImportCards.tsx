"use client";

import { useState } from "react";
import { useWantList, toWantListItem, type WantListItem } from "@/app/WantListContext";
import { itemQty, totalQty } from "@/lib/optimiser/want-list";
import type { BulkLookupResult, BulkLookupInput } from "@/app/api/cards/bulk-lookup/route";
import { track } from "@/lib/analytics";
import { MAX_CARD_QTY } from "@/lib/config";

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
        qty: Math.min(parseInt(full[1], 10), MAX_CARD_QTY),
      });
      continue;
    }

    // {qty} {Name} ({SET}) — set but no collector number
    const withSet = line.match(/^(\d+)\s+(.+?)\s+\(([A-Z0-9]+)\)\s*$/i);
    if (withSet) {
      results.push({
        name: withSet[2].trim(),
        setCode: withSet[3].toLowerCase(),
        qty: Math.min(parseInt(withSet[1], 10), MAX_CARD_QTY),
      });
      continue;
    }

    // Plain: {qty} {Name}  or  {qty}x {Name}  or  x{qty} {Name}
    const plain = line.match(/^(\d+)[xX]?\s+(.+)$/) ?? line.match(/^[xX](\d+)\s+(.+)$/);
    if (plain) {
      results.push({ name: plain[2].trim(), qty: Math.min(parseInt(plain[1], 10), MAX_CARD_QTY) });
      continue;
    }

    // No quantity prefix — treat as single copy
    if (line.length > 0) {
      results.push({ name: line, qty: 1 });
    }
  }

  return results.filter((c) => c.name.length > 0);
}

export type ImportSummary = { added: number; copies: number; alreadyListed: number; notFound: string[] };

/**
 * Paste or upload a card list and press Import: every card found goes straight
 * onto the want list at its cheapest listing, with the line's quantity. Cards
 * come in unlocked, even when the line names a set — Arena and MTGO exports name
 * one on every line, so honouring it would lock the whole deck. Uploading a file
 * imports it at once. `onImported` hands the parent the outcome to show.
 */
export function ImportCards({ onImported }: { onImported: (summary: ImportSummary) => void }) {
  const { items, replaceItems } = useWantList();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importList(raw: string, source: "file" | "paste") {
    const cards = parseCardList(raw);
    if (cards.length === 0) {
      setExpanded(true);
      setError("No card names found. Enter one card name per line.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cards/bulk-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const { results } = await res.json() as { results: BulkLookupResult[] };

      const summary: ImportSummary = { added: 0, copies: 0, alreadyListed: 0, notFound: [] };
      // One want per card: a list can name a card twice (main deck and sideboard), so its
      // lines add up, capped like any quantity.
      const wanted = new Map<string, { result: BulkLookupResult; qty: number }>();
      for (const r of results) {
        if (!r.cheapest || !r.cardId || !r.cardName) {
          summary.notFound.push(r.inputName);
          continue;
        }
        const w = wanted.get(r.cardId);
        wanted.set(r.cardId, { result: w?.result ?? r, qty: Math.min((w?.qty ?? 0) + r.qty, MAX_CARD_QTY) });
      }

      // A card already on the list — at any listing, perhaps split across stores by an
      // earlier Optimise — isn't added again; it's raised to the imported count if it's short.
      const next: WantListItem[] = [...items];
      for (const [cardId, { result: r, qty }] of wanted) {
        const onList = next.filter((i) => i.cardId === cardId);
        if (onList.length > 0) {
          summary.alreadyListed++;
          const short = qty - totalQty(onList);
          if (short > 0) {
            const first = onList[0];
            next[next.indexOf(first)] = { ...first, qty: Math.min(itemQty(first) + short, MAX_CARD_QTY) };
          }
          continue;
        }
        next.push(toWantListItem(
          { ...r.cheapest!, imageUri: r.imageUri },
          { cardId, cardSlug: r.cardSlug, cardName: r.cardName! },
          { printingMode: "any", qty },
        ));
        summary.added++;
        summary.copies += qty;
      }
      replaceItems(next);

      track("bulk-import", { source, cards: cards.length, found: summary.added + summary.alreadyListed });
      setText("");
      setExpanded(false);
      onImported(summary);
    } catch (err) {
      track("bulk-import", { source, cards: cards.length, error: true });
      setExpanded(true);
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => importList((ev.target?.result as string) ?? "", "file");
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <div className="rounded-lg border border-subtle bg-surface overflow-hidden">
      <div className="px-4 py-3 bg-cream-muted flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-cream text-sm">Import a list</h2>
          <p className="text-xs text-cream-dim mt-0.5">
            Paste a deck or card list, or upload a .txt file. MTGO and Arena exports work.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <label className="rounded-lg border border-subtle bg-muted px-3 py-1.5 text-xs text-cream-dim hover:text-cream hover:border-accent-border transition-colors cursor-pointer whitespace-nowrap">
            {loading && !expanded ? "Importing…" : "Upload .txt"}
            <input type="file" accept=".txt,.csv,text/plain" className="hidden" onChange={handleFileChange} />
          </label>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="rounded-lg border border-subtle bg-muted px-3 py-1.5 text-xs text-cream-dim hover:text-cream hover:border-accent-border transition-colors whitespace-nowrap"
          >
            {expanded ? "Collapse ▲" : "Paste list ▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-3 border-t border-subtle">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"1 Lightning Bolt (M11) 146\n4x Counterspell\n9 Forest (EOE) 275 #!Land"}
            rows={6}
            aria-label="Card list"
            className="w-full rounded-lg border border-subtle bg-bg text-cream text-sm px-3 py-2 resize-y placeholder:text-cream-dim/50 focus:outline-none focus:border-accent-border"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => importList(text, "paste")}
              disabled={loading || !text.trim()}
              className="rounded-lg bg-cta px-4 py-2 text-sm font-semibold text-white hover:bg-price transition-colors disabled:opacity-40"
            >
              {loading ? "Importing…" : "Import"}
            </button>
            {text && (
              <button onClick={() => { setText(""); setError(null); }} className="text-xs text-cream-dim hover:text-cream transition-colors">
                Clear
              </button>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
