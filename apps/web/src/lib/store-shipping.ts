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
  games_portal: 6.50,
  guf: 6.50,
  inn_games: 6.50,
  irresistible_force: 6.50,
  legends_and_collectables: 6.50,
  lots_moore: 6.50,
  mana_market: 6.50,
  pro_gamers: 6.50,
  rhystic_nostalgia: 6.50,
  tabernacle_games: 6.50,
  cardhouse: 6.50,
  tcg_singles: 8.50,
  chromatic_games: 6.50,
  general_games: 6.50,
  elemental_arcade: 6.50,
  ronin_games: 6.50,
  from_the_deep: 6.50,
  crit_hit: 6.50,
  hr_gamer: 6.50,
  mega_games: 6.50,
  ozzie_collectables: 6.50,
  playmantis: 6.50,
  raptor_games: 6.50,
  kastle_cards_and_games: 6.50,
  shuffled: 6.50,
  the_card_hub_australia: 6.50,
  that_game_store: 6.50,
  area52: 6.50,
  ebay_au: null,    // per-seller — handled as per-item shipping, not flat rate
};
