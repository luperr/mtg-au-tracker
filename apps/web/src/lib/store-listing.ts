/**
 * One in-stock sell listing: a specific printing at a specific store, at a
 * specific price. The canonical shape for "printing + store + price" —
 * previously redeclared independently as StorePrinting (WantListView),
 * Listing (optimize algorithm), and inline in the store-printings route.
 */
export type StoreListing = {
  printingId: string;
  setName: string;
  setCode: string;
  rarity: string;
  isFoil: boolean;
  finish: "nonfoil" | "foil" | "etched";
  borderColor: string | null;
  frameEffects: string[];
  imageUri: string | null;
  priceAud: number;
  shippingAud: number | null;
  condition: string | null;
  url: string | null;
  storeId: string;
  storeName: string;
};

/** Raw snake_case SQL row shape shared by the queries that produce a StoreListing. */
export type StoreListingRow = {
  printing_id: string;
  set_name: string;
  set_code: string;
  rarity: string;
  is_foil: boolean;
  finish: string | null;
  border_color: string | null;
  frame_effects: string[];
  image_uri: string | null;
  price_aud: string;
  shipping_aud: string | null;
  condition: string | null;
  url: string | null;
  store_id: string;
  store_name: string;
};

/** Maps a snake_case SQL row to a StoreListing, including the finish fallback for pre-finish-column rows. */
export function mapListingRow(row: StoreListingRow): StoreListing {
  return {
    printingId: row.printing_id,
    setName: row.set_name,
    setCode: row.set_code,
    rarity: row.rarity,
    isFoil: row.is_foil,
    finish: (row.finish ?? (row.is_foil ? "foil" : "nonfoil")) as StoreListing["finish"],
    borderColor: row.border_color ?? null,
    frameEffects: row.frame_effects ?? [],
    imageUri: row.image_uri,
    priceAud: parseFloat(row.price_aud),
    shippingAud: row.shipping_aud ? parseFloat(row.shipping_aud) : null,
    condition: row.condition,
    url: row.url,
    storeId: row.store_id,
    storeName: row.store_name,
  };
}
