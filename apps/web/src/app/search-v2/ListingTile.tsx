"use client";

import { BuyLink } from "@/app/BuyLink";
import { SetSymbol } from "@/app/SetSymbol";
import { useWantList, toWantListItem, wantListItemId } from "@/app/WantListContext";
import { MTG_CARD_ASPECT_RATIO } from "@/lib/config";
import { facetValueLabel, DEFAULT_TREATMENT, type SearchView } from "@/lib/search-v2/params";
import type { SearchTile } from "@/lib/search-v2/types";
import { cardHref, fmtAUD, trackEvent } from "@/lib/utils";

/**
 * Adds the tile's own listing — the cheapest one in its group — straight from the
 * row, with no follow-up fetch: the query already returned everything a want-list
 * item needs.
 */
function AddToWantListButton({ tile }: { tile: SearchTile }) {
  const { addItem, hasItem } = useWantList();
  const added = hasItem(wantListItemId(tile.printing_id, tile.store_id, tile.url));

  function handleClick() {
    if (added) return;
    addItem(toWantListItem(
      {
        printingId: tile.printing_id,
        setName: tile.set_name,
        setCode: tile.set_code,
        rarity: tile.rarity,
        isFoil: tile.is_foil,
        finish: tile.finish,
        borderColor: tile.border_color,
        frameEffects: tile.frame_effects,
        imageUri: tile.image_uri,
        priceAud: tile.price,
        shippingAud: tile.shipping_aud ? parseFloat(tile.shipping_aud) : null,
        condition: tile.condition,
        url: tile.url,
        storeId: tile.store_id,
        storeName: tile.store_name,
      },
      { cardId: tile.card_id, cardSlug: tile.slug, cardName: tile.name },
    ));
    trackEvent("want-list-add", { card: tile.name, source: "search-v2" });
  }

  return (
    <button
      onClick={handleClick}
      aria-label={added ? "In want list" : "Add to want list"}
      className={`w-7 h-7 rounded flex items-center justify-center text-sm transition-colors shrink-0 ${
        added ? "bg-price/20 text-price" : "bg-muted text-cream-dim/40 hover:bg-price/20 hover:text-price"
      }`}
    >
      {added ? "✓" : "+"}
    </button>
  );
}

export function ListingTile({ tile, view, query }: { tile: SearchTile; view: SearchView; query: string }) {
  const href = cardHref(tile.slug, tile.card_id, query);
  const badges = [
    tile.finish !== "nonfoil" && facetValueLabel("finish", tile.finish),
    tile.treatment !== DEFAULT_TREATMENT && facetValueLabel("treatment", tile.treatment),
    view === "listings" && tile.condition,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col rounded-lg overflow-hidden border border-subtle bg-surface hover:border-accent transition-colors group">
      <a href={href} onClick={() => trackEvent("card-click", { card: tile.name })} className="block w-full overflow-hidden">
        {tile.image_uri ? (
          <img
            src={tile.image_uri}
            alt={tile.name}
            className="w-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
            style={{ aspectRatio: MTG_CARD_ASPECT_RATIO }}
            loading="lazy"
          />
        ) : (
          <div className="w-full bg-muted flex items-center justify-center text-cream-dim/30 text-xs" style={{ aspectRatio: MTG_CARD_ASPECT_RATIO }}>
            No image
          </div>
        )}
      </a>

      <div className="px-2 pt-1.5 pb-2 flex flex-col gap-1 flex-1">
        <a href={href} className="text-xs font-medium text-cream truncate hover:text-accent-light transition-colors" title={tile.name}>
          {tile.name}
        </a>

        <div className="flex items-center gap-1 text-[11px] text-cream-dim min-w-0">
          <SetSymbol setCode={tile.set_code} setName={tile.set_name} rarity={tile.rarity} size={12} />
          <span className="truncate" title={tile.set_name}>{tile.set_name}</span>
          <span className="shrink-0 text-cream-dim/50">#{tile.collector_number}</span>
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {badges.map((b) => (
              <span key={b} className="text-[10px] px-1.5 py-px rounded bg-muted text-cream-dim">{b}</span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-1 pt-1">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-price tabular-nums">{fmtAUD(tile.price)}</div>
            <div className="text-[11px] text-cream-dim truncate">
              {tile.url ? (
                <BuyLink
                  href={tile.url}
                  storeId={tile.store_id}
                  card={tile.name}
                  price={tile.price}
                  source="search-v2"
                  printingId={tile.printing_id}
                  className="hover:text-accent transition-colors"
                >
                  {tile.store_name} ↗
                </BuyLink>
              ) : tile.store_name}
            </div>
            {tile.other_stores ? (
              <div className="text-[10px] text-cream-dim/60">
                +{tile.other_stores} more {tile.other_stores === 1 ? "store" : "stores"}
                {tile.other_min !== null && <> from {fmtAUD(tile.other_min)}</>}
              </div>
            ) : null}
          </div>
          <AddToWantListButton tile={tile} />
        </div>
      </div>
    </div>
  );
}
