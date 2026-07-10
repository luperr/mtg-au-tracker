"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import type { PrintingWithPrices } from "@/lib/db";
import { useWantList, toWantListItem, wantListItemId } from "@/app/WantListContext";
import { fmtAUD } from "@/lib/utils";
import { Dropdown, OptionItem } from "@/app/Dropdown";
import { SetSymbol } from "@/app/SetSymbol";
import { BuyLink } from "@/app/BuyLink";
import { getVariantTags, variantBadge, VARIANT_LABELS, VARIANT_ORDER, type VariantTag } from "@/lib/variant-utils";

type SortBy = "price_asc" | "price_desc" | "total_asc" | "total_desc" | "newest" | "oldest";

const SORT_LABELS: Record<SortBy, string> = {
  price_asc: "Price: Low → High",
  price_desc: "Price: High → Low",
  total_asc: "Price + Postage: Low → High",
  total_desc: "Price + Postage: High → Low",
  newest: "Newest Set First",
  oldest: "Oldest Set First",
};

interface Row {
  printing: PrintingWithPrices;
  storeId: string;
  storeName: string;
  priceAud: number;
  shippingAud: number | null;
  condition: string | null;
  inStock: boolean;
  url: string | null;
}

const chipCls = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
    active
      ? "border-accent bg-accent/10 text-accent-light"
      : "border-subtle bg-muted/60 text-cream-dim hover:border-cream-dim/40 hover:text-cream"
  }`;

// ── Want list button ───────────────────────────────────────────────────────────

function WantListButton({
  row,
  cardId,
  cardSlug,
  cardName,
  size = "sm",
}: {
  row: Row;
  cardId: string;
  cardSlug: string;
  cardName: string;
  size?: "sm" | "md";
}) {
  const { addItem, removeItem, hasItem } = useWantList();
  const itemId = wantListItemId(row.printing.id, row.storeId, row.url);
  const inList = hasItem(itemId);
  const cls = size === "md" ? "w-8 h-8" : "w-6 h-6";
  return (
    <button
      onClick={() => {
        if (inList) {
          removeItem(itemId);
        } else {
          addItem(toWantListItem({
            printingId: row.printing.id,
            setName: row.printing.setName,
            setCode: row.printing.setCode,
            rarity: row.printing.rarity,
            isFoil: row.printing.isFoil,
            finish: row.printing.finish,
            borderColor: row.printing.borderColor,
            frameEffects: row.printing.frameEffects,
            storeId: row.storeId,
            storeName: row.storeName,
            priceAud: row.priceAud,
            shippingAud: row.shippingAud,
            condition: row.condition,
            url: row.url,
            imageUri: row.printing.imageUri,
          }, { cardId, cardSlug, cardName }));
        }
      }}
      title={inList ? "Remove from want list" : "Add to want list"}
      className={`${cls} rounded flex items-center justify-center text-sm transition-colors ${
        inList
          ? "bg-price/20 text-price hover:bg-price/10"
          : "bg-muted text-cream-dim/40 hover:bg-price/20 hover:text-price"
      }`}
    >
      {inList ? "✓" : "+"}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PricesTable({
  printings,
  defaultImage,
  onHoverImage,
  cardId,
  cardSlug,
  cardName,
}: {
  printings: PrintingWithPrices[];
  defaultImage: string | null;
  onHoverImage: (uri: string | null, uriBack?: string | null) => void;
  cardId: string;
  cardSlug: string;
  cardName: string;
}) {
  const [inStockOnly, setInStockOnly] = useState(true);
  const [selectedVariants, setSelectedVariants] = useState<Set<VariantTag>>(new Set());
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
  const [selectedSets, setSelectedSets] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>("price_asc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter(uri: string | null, uriBack: string | null | undefined) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      onHoverImage(uri, uriBack ?? null);
    }, 500);
  }

  function handleMouseLeave() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    // Intentionally no reset — image stays on last-hovered printing
  }

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const allStores = useMemo(() => {
    const s = new Set<string>();
    for (const p of printings) for (const pr of p.prices) s.add(pr.storeName);
    return Array.from(s).sort();
  }, [printings]);

  const allSets = useMemo(() => {
    const s = new Map<string, string>(); // setName → releasedAt
    for (const p of printings) s.set(p.setName, p.releasedAt ? String(p.releasedAt) : "");
    return Array.from(s.entries())
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([name]) => name);
  }, [printings]);

  const availableVariants = useMemo(() => {
    const tags = new Set<VariantTag>();
    for (const p of printings) for (const t of getVariantTags(p)) tags.add(t);
    return VARIANT_ORDER.filter((t) => tags.has(t));
  }, [printings]);

  function toggleVariant(tag: VariantTag) {
    setPage(0);
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  function toggleInSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setPage(0);
    setter((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }

  const rows = useMemo<Row[]>(() => {
    const flat: Row[] = [];
    for (const printing of printings) {
      if (selectedVariants.size > 0) {
        const tags = getVariantTags(printing);
        if (![...selectedVariants].some((v) => tags.has(v))) continue;
      }
      if (selectedSets.size > 0 && !selectedSets.has(printing.setName)) continue;
      for (const price of printing.prices) {
        if (inStockOnly && !price.inStock) continue;
        if (selectedStores.size > 0 && !selectedStores.has(price.storeName)) continue;
        flat.push({
          printing,
          storeId: price.storeId,
          storeName: price.storeName,
          priceAud: parseFloat(price.priceAud),
          shippingAud: price.shippingAud ? parseFloat(price.shippingAud) : null,
          condition: price.condition,
          inStock: price.inStock,
          url: price.url,
        });
      }
    }
    return flat.sort((a, b) => {
      const totalA = a.priceAud + (a.shippingAud ?? 0);
      const totalB = b.priceAud + (b.shippingAud ?? 0);
      switch (sortBy) {
        case "price_asc":    return a.priceAud - b.priceAud;
        case "price_desc":   return b.priceAud - a.priceAud;
        case "total_asc":    return totalA - totalB;
        case "total_desc":   return totalB - totalA;
        case "newest":       return String(b.printing.releasedAt ?? "").localeCompare(String(a.printing.releasedAt ?? ""));
        case "oldest":       return String(a.printing.releasedAt ?? "").localeCompare(String(b.printing.releasedAt ?? ""));
      }
    });
  }, [printings, inStockOnly, selectedVariants, selectedStores, selectedSets, sortBy]);

  // When filters change, update the displayed image to the first visible printing
  // (or defaultImage when no rows match). Depends on the filter state directly so
  // it fires even when rows stays empty across two different filter combinations.
  useEffect(() => {
    const first = rows[0];
    onHoverImage(
      first?.printing.imageUri ?? defaultImage,
      first?.printing.imageUriBack ?? null,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inStockOnly, sortBy, selectedVariants, selectedStores, selectedSets]);

  const filtersNonDefault =
    !inStockOnly || selectedVariants.size > 0 || selectedStores.size > 0 || selectedSets.size > 0;

  const clearFilters = () => {
    setInStockOnly(true);
    setSelectedVariants(new Set());
    setSelectedStores(new Set());
    setSelectedSets(new Set());
    setPage(0);
  };

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Build variant chip label
  const variantChipLabel =
    selectedVariants.size === 0
      ? "Variant"
      : selectedVariants.size === 1
        ? VARIANT_LABELS[[...selectedVariants][0]]
        : `Variant (${selectedVariants.size})`;

  return (
    <div>
      {/* ── Filter bar — always visible, horizontally scrollable ── */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* In Stock toggle */}
        <button onClick={() => { setInStockOnly(!inStockOnly); setPage(0); }} className={chipCls(inStockOnly)}>
          In stock
        </button>

        {/* Variant filter */}
        {availableVariants.length > 1 && (
          <Dropdown label={variantChipLabel} active={selectedVariants.size > 0} align="left" rounded>
            <div className="py-1 max-h-48 overflow-y-auto">
              {availableVariants.map((tag) => (
                <OptionItem
                  key={tag}
                  type="check"
                  label={VARIANT_LABELS[tag]}
                  checked={selectedVariants.has(tag)}
                  onClick={() => toggleVariant(tag)}
                />
              ))}
            </div>
          </Dropdown>
        )}

        {/* Store filter */}
        {allStores.length > 1 && (
          <Dropdown
            label={selectedStores.size > 0 ? `Store (${selectedStores.size})` : "Store"}
            active={selectedStores.size > 0}
            align="left"
            rounded
          >
            <div className="py-1 max-h-48 overflow-y-auto">
              {allStores.map((store) => (
                <OptionItem key={store} type="check" label={store} checked={selectedStores.has(store)} onClick={() => toggleInSet(setSelectedStores, store)} />
              ))}
            </div>
          </Dropdown>
        )}

        {/* Set filter */}
        {allSets.length > 1 && (
          <Dropdown
            label={selectedSets.size > 0 ? `Set (${selectedSets.size})` : "Set"}
            active={selectedSets.size > 0}
            align="left"
            rounded
          >
            <div className="py-1 max-h-48 overflow-y-auto">
              {allSets.map((set) => (
                <OptionItem key={set} type="check" label={set} checked={selectedSets.has(set)} onClick={() => toggleInSet(setSelectedSets, set)} />
              ))}
            </div>
          </Dropdown>
        )}

        {/* Reset */}
        {filtersNonDefault && (
          <button onClick={clearFilters} className="shrink-0 px-2 text-[10px] text-cream-dim/40 hover:text-cream-dim transition-colors">
            Reset
          </button>
        )}

        {/* Sort + count — pushed right */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <span className="text-[10px] text-cream-dim/30">{rows.length}</span>
          <Dropdown label="Sort" active={sortBy !== "price_asc"} align="right" rounded>
            <div className="py-1">
              {(Object.entries(SORT_LABELS) as [SortBy, string][]).map(([key, label]) => (
                <OptionItem key={key} label={label} checked={sortBy === key} onClick={() => { setSortBy(key); setPage(0); }} />
              ))}
            </div>
          </Dropdown>
        </div>
      </div>

      {/* ── Price list ── */}
      <div className="rounded-lg border border-subtle bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-cream-dim/50">
            {filtersNonDefault ? "No prices match the current filters" : "No prices available"}
          </div>
        ) : (
          <>
            {/* Mobile card list (< sm) */}
            <div className="sm:hidden flex flex-col divide-y divide-subtle/60">
              {pageRows.map((row, i) => {
                const badge = variantBadge(row.printing);
                return (
                  <div
                    key={`m-${row.printing.id}-${row.storeName}-${i}`}
                    className="px-3 py-2.5 flex flex-col gap-1 hover:bg-muted transition-colors"
                    onMouseEnter={() => handleMouseEnter(row.printing.imageUri, row.printing.imageUriBack)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {/* Line 1: Store + Price */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-cream font-medium text-sm truncate">{row.storeName}</span>
                      <span className="text-price font-semibold shrink-0 text-sm">
                        {fmtAUD(row.priceAud)}
                        {row.shippingAud !== null && (
                          <span className="ml-1 text-xs font-normal text-cream-dim/60">
                            (+{row.shippingAud === 0 ? "free" : fmtAUD(row.shippingAud)})
                          </span>
                        )}
                      </span>
                    </div>
                    {/* Line 2: Set info + stock + actions */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 text-xs text-cream-dim">
                        <SetSymbol
                          setCode={row.printing.setCode}
                          setName={row.printing.setName}
                          rarity={row.printing.rarity}
                        />
                        <span className="truncate">{row.printing.setName}</span>
                        {row.printing.isFoil && !badge && (
                          <span className="text-[10px] text-accent shrink-0">✦</span>
                        )}
                        {badge && (
                          <span className="text-[10px] text-accent shrink-0 font-medium">{badge}</span>
                        )}
                        <span className={`shrink-0 ${row.inStock ? "text-green-400" : "text-red-400"}`}>
                          {row.inStock ? "In stock" : "Out"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {row.url && (
                          <BuyLink
                            href={row.url}
                            storeId={row.storeId}
                            card={cardName}
                            price={row.priceAud}
                            source="card-detail"
                          />
                        )}
                        {row.inStock && (
                          <WantListButton row={row} cardId={cardId} cardSlug={cardSlug} cardName={cardName} size="md" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table (sm+) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm min-w-[360px]">
                <colgroup>
                  <col className="w-[180px] sm:w-[220px]" />
                  <col className="w-[110px] sm:w-[140px]" />
                  <col className="w-auto" />
                  <col className="w-[68px]" />
                  <col className="w-[52px]" />
                  <col className="w-[40px]" />
                </colgroup>
                <thead>
                  <tr className="text-xs bg-cream-muted border-b border-subtle">
                    <th className="px-4 py-2 text-left font-medium text-cream-dim">Set</th>
                    <th className="px-3 py-2 text-left font-medium text-cream-dim">Store</th>
                    <th className="px-3 py-2 text-right font-medium text-cream-dim">Price AUD <span className="font-normal text-cream-dim/50">(postage)</span></th>
                    <th className="px-3 py-2 text-center font-medium text-cream-dim">Stock</th>
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => {
                    const badge = variantBadge(row.printing);
                    return (
                      <tr
                        key={`d-${row.printing.id}-${row.storeName}-${i}`}
                        className="border-b border-subtle/60 last:border-0 hover:bg-muted transition-colors cursor-default"
                        onMouseEnter={() => handleMouseEnter(row.printing.imageUri, row.printing.imageUriBack)}
                        onMouseLeave={handleMouseLeave}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <SetSymbol
                              setCode={row.printing.setCode}
                              setName={row.printing.setName}
                              rarity={row.printing.rarity}
                            />
                            <span className="text-cream truncate max-w-[160px] hidden sm:inline">
                              {row.printing.setName}
                            </span>
                            {row.printing.isFoil && !badge && (
                              <span className="text-[10px] text-accent shrink-0">✦</span>
                            )}
                            {badge && (
                              <span className="text-[10px] text-accent shrink-0 font-medium">{badge}</span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-2.5 text-cream font-medium">{row.storeName}</td>

                        <td className="px-3 py-2.5 text-right text-price font-semibold">
                          {fmtAUD(row.priceAud)}
                          {row.shippingAud !== null && (
                            <span className="ml-1 text-xs font-normal text-cream-dim/60">
                              (+{row.shippingAud === 0 ? "free" : fmtAUD(row.shippingAud)})
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              row.inStock
                                ? "bg-green-900/50 text-green-400"
                                : "bg-red-900/50 text-red-400"
                            }`}
                          >
                            {row.inStock ? "In stock" : "Out"}
                          </span>
                        </td>

                        <td className="px-3 py-2.5 text-right">
                          {row.url && (
                            <BuyLink
                              href={row.url}
                              storeId={row.storeId}
                              card={cardName}
                              price={row.priceAud}
                              source="card-detail"
                            />
                          )}
                        </td>

                        <td className="px-2 py-2.5 text-right">
                          {row.inStock && (
                            <WantListButton row={row} cardId={cardId} cardSlug={cardSlug} cardName={cardName} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-subtle bg-cream-muted text-xs text-cream-dim/60">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="disabled:opacity-30 hover:text-cream transition-colors"
                >
                  ← Prev
                </button>
                <span>
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="disabled:opacity-30 hover:text-cream transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
