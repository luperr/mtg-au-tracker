/**
 * Flat-rate postage per store (AUD), keyed by store_id.
 * Used as a fallback when the DB doesn't supply shipping_aud on a price row.
 * Adjust these values if store policies change.
 * null means "unknown / varies" — no estimated postage will be shown.
 */
export const STORE_FLAT_SHIPPING_AUD: Record<string, number | null> = {
  good_games: 6.50,
  mtg_mate: 6.50,
  gameology: 10.00,
  plenty_of_games: 7.00,
  ebay_au: null,    // per-seller — handled as per-item shipping, not flat rate
};
