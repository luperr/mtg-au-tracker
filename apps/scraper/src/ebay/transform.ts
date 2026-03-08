/**
 * eBay listing title parser — transforms a raw EbayItemSummary into a ScrapedCard.
 *
 * eBay titles are seller-written and wildly inconsistent. Examples:
 *   "MTG Magic Lightning Bolt M11 NM Foil x1"
 *   "Magic The Gathering - Jace, the Mind Sculptor - JTMS - Worldwake - NM"
 *   "BLACK LOTUS Alpha MTG Magic Rare HP 1x"
 *   "Lightning bolt x4 playset mtg near mint"
 *   "PSA 9 Black Lotus Alpha MTG"        ← graded slab, skip
 *   "MTG Mystery Lot 100 cards bulk"     ← bulk lot, skip
 *
 * Strategy:
 *   1. Filter out slabs (PSA/BGS/CGC), bulk lots, proxies, tokens
 *   2. Extract foil flag (looks for "foil" keyword)
 *   3. Extract condition (NM, LP, MP, HP, DMG and common variants)
 *   4. Extract set name (common abbreviations and full names)
 *   5. Extract card name — what's left after stripping noise words
 *   6. Map buying options: FIXED_PRICE → sell price, AUCTION → skip (unreliable)
 *
 * This is intentionally conservative — it's better to produce null (unmatched)
 * than to match the wrong card. The unmatched_cards table captures everything
 * that falls through for later review.
 */

import type { ScrapedCard } from "@mtg-au/shared";
import type { EbayItemSummary } from "./browse-client.js";

// ── Skip filters ──────────────────────────────────────────────────────────────
// Listings matching any of these patterns are not singles and should be skipped.

const SKIP_PATTERNS = [
  /\bpsa\s*\d/i,           // PSA graded slabs
  /\bbgs\s*\d/i,           // Beckett graded
  /\bcgc\s*\d/i,           // CGC graded
  /\bsgc\s*\d/i,           // SGC graded
  /\bproxy\b/i,            // Proxies
  /\bproxies\b/i,
  /\bbulk\b/i,             // Bulk lots
  /\blot\s+of\s+\d/i,      // "lot of 50"
  /\b\d+\s*card[s]?\s+lot/i, // "100 cards lot"
  /\bcomplete\s+set\b/i,   // Complete set listings
  /\bcomplete\s+playset\b/i,
  /\bbooster\b/i,          // Booster packs/boxes
  /\bdraft\s+pack/i,
  /\bsleeve[s]?\b/i,       // Accessories
  /\bdeck\s+box/i,
  /\bplaymat\b/i,
  /\btoken\b/i,            // Tokens (not singles)
  /\bemblem\b/i,
  /\bcounter[s]?\b/i,
  /\bgift\s+card/i,
];

/**
 * Returns true if this listing should be skipped (not a single card).
 */
export function shouldSkip(title: string): boolean {
  return SKIP_PATTERNS.some((pat) => pat.test(title));
}

// ── Foil detection ────────────────────────────────────────────────────────────

const FOIL_PATTERN = /\bfoil\b/i;

export function extractFoil(title: string): boolean {
  return FOIL_PATTERN.test(title);
}

// ── Condition extraction ──────────────────────────────────────────────────────
// Maps common eBay condition strings to our normalised condition codes.

const CONDITION_MAP: Array<[RegExp, string]> = [
  [/\bnm[-/]?m\b/i, "NM"],        // NM/M, NM-M
  [/\bnear\s*mint\b/i, "NM"],
  [/\bnm\b/i, "NM"],
  [/\bmint\b/i, "NM"],
  [/\blp\b/i, "LP"],              // Lightly Played
  [/\blight[ly]?\s*played\b/i, "LP"],
  [/\bsp\b/i, "LP"],              // Slightly Played (= LP in most stores)
  [/\bslight[ly]?\s*played\b/i, "LP"],
  [/\bmp\b/i, "MP"],              // Moderately Played
  [/\bmod[erately]*\s*played\b/i, "MP"],
  [/\bhp\b/i, "HP"],              // Heavily Played
  [/\bheavily?\s*played\b/i, "HP"],
  [/\bdmg\b/i, "DMG"],           // Damaged
  [/\bdamaged\b/i, "DMG"],
  [/\bpoor\b/i, "DMG"],
  [/\bexcellent\b/i, "LP"],      // eBay's "Excellent" maps to LP
  [/\bvery\s*good\b/i, "LP"],    // eBay's "Very Good"
  [/\bgood\b/i, "MP"],
];

export function extractCondition(title: string, ebayCondition: string): string | null {
  // First try to extract from the title (more specific than eBay's coarse condition)
  for (const [pattern, code] of CONDITION_MAP) {
    if (pattern.test(title)) return code;
  }

  // Fall back to eBay's own condition field
  const lower = ebayCondition.toLowerCase();
  if (lower.includes("new") || lower.includes("mint")) return "NM";
  if (lower.includes("like new")) return "NM";
  if (lower.includes("very good")) return "LP";
  if (lower.includes("good")) return "MP";
  if (lower.includes("acceptable")) return "HP";
  if (lower.includes("for parts")) return "DMG";
  if (lower.includes("used")) return "LP"; // Assume LP for generic "Used"

  return null;
}

// ── Set name extraction ───────────────────────────────────────────────────────
// Common set abbreviations and names used in eBay titles.
// Maps title keyword → Scryfall set name (not code — code lookup happens in CardMatcher).

const SET_PATTERNS: Array<[RegExp, string]> = [
  // Common abbreviations
  [/\balpha\b/i, "Limited Edition Alpha"],
  [/\bbeta\b/i, "Limited Edition Beta"],
  [/\bunlimited\b/i, "Unlimited Edition"],
  [/\brevised\b/i, "Revised Edition"],
  [/\b3rd\s*ed/i, "Revised Edition"],
  [/\barabian\s*nights\b/i, "Arabian Nights"],
  [/\bantiquitie[s]?\b/i, "Antiquities"],
  [/\blegends\b/i, "Legends"],
  [/\bthe\s*dark\b/i, "The Dark"],
  [/\bfallen\s*empires\b/i, "Fallen Empires"],
  [/\bhomelands\b/i, "Homelands"],
  [/\balliances\b/i, "Alliances"],
  [/\bmirage\b/i, "Mirage"],
  [/\bvisions\b/i, "Visions"],
  [/\bweatherligh[t]?\b/i, "Weatherlight"],
  [/\btempest\b/i, "Tempest"],
  [/\bstronghold\b/i, "Stronghold"],
  [/\bexodus\b/i, "Exodus"],
  [/\burzas?\s*saga\b/i, "Urza's Saga"],
  [/\burzas?\s*legacy\b/i, "Urza's Legacy"],
  [/\burzas?\s*destiny\b/i, "Urza's Destiny"],
  [/\bmercadian\s*masques\b/i, "Mercadian Masques"],
  [/\bnemesis\b/i, "Nemesis"],
  [/\bprophecy\b/i, "Prophecy"],
  [/\binvasion\b/i, "Invasion"],
  [/\bplaneshift\b/i, "Planeshift"],
  [/\bapocalypse\b/i, "Apocalypse"],
  [/\bodyssey\b/i, "Odyssey"],
  [/\btorment\b/i, "Torment"],
  [/\bjudgment\b/i, "Judgment"],
  [/\bonnslaugth[t]?\b/i, "Onslaught"],
  [/\blegions\b/i, "Legions"],
  [/\bscourge\b/i, "Scourge"],
  [/\bmirrodin\b/i, "Mirrodin"],
  [/\bdarksteel\b/i, "Darksteel"],
  [/\bfifth\s*dawn\b/i, "Fifth Dawn"],
  [/\bchampions\b/i, "Champions of Kamigawa"],
  [/\bbetrayers\b/i, "Betrayers of Kamigawa"],
  [/\bsaviors\b/i, "Saviors of Kamigawa"],
  [/\bravnica\b.*\bguild\b/i, "Ravnica: City of Guilds"],
  [/\bguildpact\b/i, "Guildpact"],
  [/\bdissension\b/i, "Dissension"],
  [/\bcoldsnap\b/i, "Coldsnap"],
  [/\btime\s*spiral\b/i, "Time Spiral"],
  [/\bplanar\s*chaos\b/i, "Planar Chaos"],
  [/\bfuture\s*sight\b/i, "Future Sight"],
  [/\bninth\s*ed/i, "Ninth Edition"],
  [/\btenth\s*ed/i, "Tenth Edition"],
  [/\blorwyn\b/i, "Lorwyn"],
  [/\bmorningtide\b/i, "Morningtide"],
  [/\bshadowmoor\b/i, "Shadowmoor"],
  [/\bevernight\b/i, "Eventide"],
  [/\bshards\s*of\s*alara\b/i, "Shards of Alara"],
  [/\bconflux\b/i, "Conflux"],
  [/\balara\s*reborn\b/i, "Alara Reborn"],
  [/\bzen\b/i, "Zendikar"],
  [/\bzendikar\b/i, "Zendikar"],
  [/\bworldwake\b/i, "Worldwake"],
  [/\brise\s*of\s*the\s*eldrazi\b/i, "Rise of the Eldrazi"],
  [/\bscars\s*of\s*mirrodin\b/i, "Scars of Mirrodin"],
  [/\bmirrodin\s*besieged\b/i, "Mirrodin Besieged"],
  [/\bnew\s*phyrexia\b/i, "New Phyrexia"],
  [/\binnistrad\b/i, "Innistrad"],
  [/\bdark\s*ascension\b/i, "Dark Ascension"],
  [/\bavacyn\s*restored\b/i, "Avacyn Restored"],
  [/\bravnica\b/i, "Return to Ravnica"],
  [/\bgatecrash\b/i, "Gatecrash"],
  [/\bdragon[s]?\s*maze\b/i, "Dragon's Maze"],
  [/\btheros\b/i, "Theros"],
  [/\bbor[n]?\s*(in|of)\s*gods\b/i, "Born of the Gods"],
  [/\bjourney\s*into\s*nyx\b/i, "Journey into Nyx"],
  [/\bkhans\s*of\s*tarkir\b/i, "Khans of Tarkir"],
  [/\bfate\s*reforged\b/i, "Fate Reforged"],
  [/\bdragons\s*of\s*tarkir\b/i, "Dragons of Tarkir"],
  [/\bbattle\s*for\s*zendikar\b/i, "Battle for Zendikar"],
  [/\boath\s*of\s*the\s*gatewatch\b/i, "Oath of the Gatewatch"],
  [/\bshadows\s*over\s*innistrad\b/i, "Shadows over Innistrad"],
  [/\beldritch\s*moon\b/i, "Eldritch Moon"],
  [/\bamonkhet\b/i, "Amonkhet"],
  [/\bhour\s*of\s*devastation\b/i, "Hour of Devastation"],
  [/\bixalan\b/i, "Ixalan"],
  [/\brivals\s*of\s*ixalan\b/i, "Rivals of Ixalan"],
  [/\bdom\b/i, "Dominaria"],
  [/\bdominaria\b/i, "Dominaria"],
  [/\bguilds\s*of\s*ravnica\b/i, "Guilds of Ravnica"],
  [/\bravnica\s*allegiance\b/i, "Ravnica Allegiance"],
  [/\bwar\s*of\s*the\s*spark\b/i, "War of the Spark"],
  [/\bthrone\s*of\s*eldraine\b/i, "Throne of Eldraine"],
  [/\btheros\s*beyond\b/i, "Theros Beyond Death"],
  [/\bikoria\b/i, "Ikoria: Lair of Behemoths"],
  [/\bcore\s*(set\s*)?2019\b/i, "Core Set 2019"],
  [/\bcore\s*(set\s*)?2020\b/i, "Core Set 2020"],
  [/\bcore\s*(set\s*)?2021\b/i, "Core Set 2021"],
  [/\bzendikar\s*rising\b/i, "Zendikar Rising"],
  [/\bkaldheim\b/i, "Kaldheim"],
  [/\bstrixhaven\b/i, "Strixhaven: School of Mages"],
  [/\bafr\b/i, "Adventures in the Forgotten Realms"],
  [/\bforgotten\s*realms\b/i, "Adventures in the Forgotten Realms"],
  [/\binnistrad\s*mid/i, "Innistrad: Midnight Hunt"],
  [/\bcrimson\s*vow\b/i, "Innistrad: Crimson Vow"],
  [/\bneon\s*dynasty\b/i, "Kamigawa: Neon Dynasty"],
  [/\bneo\b/i, "Kamigawa: Neon Dynasty"],
  [/\bstreets\s*of\s*new\s*capenna\b/i, "Streets of New Capenna"],
  [/\bdomin[aria]*\s*united\b/i, "Dominaria United"],
  [/\bdmu\b/i, "Dominaria United"],
  [/\bbrothers[']?\s*war\b/i, "The Brothers' War"],
  [/\bphyrexia\s*all\b/i, "Phyrexia: All Will Be One"],
  [/\bmarch\s*of\s*the\s*machine\b/i, "March of the Machine"],
  [/\bwilds\s*of\s*eldraine\b/i, "Wilds of Eldraine"],
  [/\blost\s*caverns\b/i, "The Lost Caverns of Ixalan"],
  [/\bmurders\b.*\bkarlov\b/i, "Murders at Karlov Manor"],
  [/\boutlaws\b.*\bthunder\b/i, "Outlaws of Thunder Junction"],
  [/\bbloomburrow\b/i, "Bloomburrow"],
  [/\bduskmourn\b/i, "Duskmourn: House of Horror"],
  [/\bfoundations\b/i, "Magic: The Gathering Foundations"],
  // Starter/core sets
  [/\bm10\b/i, "Magic 2010"],
  [/\bm11\b/i, "Magic 2011"],
  [/\bm12\b/i, "Magic 2012"],
  [/\bm13\b/i, "Magic 2013"],
  [/\bm14\b/i, "Magic 2014"],
  [/\bm15\b/i, "Magic 2015"],
];

export function extractSetName(title: string): string | null {
  for (const [pattern, name] of SET_PATTERNS) {
    if (pattern.test(title)) return name;
  }
  return null;
}

// ── Noise word removal ─────────────────────────────────────────────────────────
// Words to strip before extracting the card name.

const NOISE_WORDS = [
  // MTG branding
  /\bmagic\s*(the\s*gathering|:?\s*the\s*gathering)?\b/gi,
  /\bmtg\b/gi,
  // Foil variants
  /\bfoil\b/gi,
  /\betched\s*foil\b/gi,
  /\bextended\s*art\b/gi,
  /\bborderless\b/gi,
  /\balt\s*art\b/gi,
  /\bsignature\s*series\b/gi,
  // Quantity
  /\bx\s*[1-9]\d*\b/gi,       // x1, x4, x 2
  /\b[1-9]\d*\s*x\b/gi,       // 1x, 4x
  /\bplayset\b/gi,
  // Condition (already extracted)
  /\b(near\s*mint|nm[-/]?m?|light[ly]?\s*played|lp|slight[ly]?\s*played|sp|mod[erately]*\s*played|mp|heavily?\s*played|hp|damaged|dmg|poor|mint|excellent|very\s*good)\b/gi,
  // Common filler
  /\bsingle\b/gi,
  /\bcard\b/gi,
  /\brare\b/gi,
  /\buncommon\b/gi,
  /\bcommon\b/gi,
  /\bmythic\b/gi,
  /\bsingle\b/gi,
  /\boriginal\b/gi,
  /\blegit\b/gi,
  /\breal\b/gi,
  /\bauthentic\b/gi,
  /\bcollector\b/gi,
  /\bedition\b/gi,
  // Punctuation and separators
  /[-–—|·•]+/g,
];

/**
 * Strip noise from an eBay title and return what's likely the card name.
 *
 * This is approximate — it will leave some garbage in complex titles.
 * The CardMatcher's fuzzy matching handles minor variations.
 */
export function extractCardName(title: string, setName: string | null): string {
  let name = title;

  // Remove the set name if we found one
  if (setName) {
    name = name.replace(new RegExp(setName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
  }

  // Remove all noise patterns
  for (const pattern of NOISE_WORDS) {
    name = name.replace(pattern, " ");
  }

  // Collapse whitespace and trim
  return name.replace(/\s+/g, " ").trim();
}

// ── Price extraction ──────────────────────────────────────────────────────────

/**
 * Get the AUD price from an eBay item.
 * Fixed-price items use `price`, auctions may use `currentBidPrice`.
 * Returns null if price is not in AUD (shouldn't happen for EBAY_AU marketplace).
 */
export function extractPrice(item: EbayItemSummary): string | null {
  const priceData = item.price ?? item.currentBidPrice;
  if (!priceData) return null;
  if (priceData.currency !== "AUD") return null;

  const val = parseFloat(priceData.value);
  if (isNaN(val) || val <= 0) return null;

  return val.toFixed(2);
}

// ── Main transform ────────────────────────────────────────────────────────────

/**
 * Transform an eBay item summary into a ScrapedCard.
 * Returns null if the listing should be skipped.
 */
export function transformEbayItem(item: EbayItemSummary): ScrapedCard | null {
  // Skip non-singles
  if (shouldSkip(item.title)) return null;

  // Skip items without a valid AUD price
  const price = extractPrice(item);
  if (!price) return null;

  // Skip auctions — bid prices are not reliable as market prices for our purposes
  // (completed sold prices would be, but Browse API only shows current bids)
  if (!item.buyingOptions?.includes("FIXED_PRICE")) return null;

  const isFoil = extractFoil(item.title);
  const condition = extractCondition(item.title, item.condition ?? "");
  const setName = extractSetName(item.title);
  const rawName = extractCardName(item.title, setName);

  // If card name is too short after cleaning, it's likely junk
  if (rawName.length < 2) return null;

  return {
    rawName,
    setCode: null,        // eBay doesn't provide Scryfall set codes
    setName,
    collectorNumber: null, // eBay doesn't provide collector numbers
    price,
    priceType: "sell",
    condition,
    isFoil,
    inStock: true,         // Active eBay listings are implicitly in stock
    sourceUrl: item.itemWebUrl,
  };
}

// ── Run directly to test ───────────────────────────────────────────────────────
// tsx src/ebay/transform.ts
if (process.argv[1]?.endsWith("transform.ts") || process.argv[1]?.endsWith("transform.js")) {
  const TEST_TITLES: Array<[string, string, string]> = [
    ["MTG Magic Lightning Bolt M11 NM Foil x1", "10.00", "Used"],
    ["Magic The Gathering - Jace, the Mind Sculptor - JTMS - Worldwake - NM", "120.00", "Used"],
    ["BLACK LOTUS Alpha MTG Magic Rare HP 1x", "50000.00", "Used"],
    ["Lightning bolt x4 playset mtg near mint", "5.00", "Like New"],
    ["PSA 9 Black Lotus Alpha MTG", "99999.00", "Used"],       // should skip
    ["MTG Mystery Lot 100 cards bulk", "30.00", "Used"],        // should skip
    ["Counterspell Unlimited Edition NM", "45.00", "Used"],
    ["Ragavan Nimble Pilferer MH2 NM foil", "80.00", "Like New"],
    ["Wrenn and Six Modern Horizons 2 LP", "55.00", "Very Good"],
    ["Thassa's Oracle Theros Beyond Death NM", "18.00", "Like New"],
  ];

  for (const [title, priceValue, condition] of TEST_TITLES) {
    const fakeItem: EbayItemSummary = {
      itemId: "test",
      title,
      price: { value: priceValue, currency: "AUD" },
      condition,
      itemWebUrl: "https://ebay.com.au/test",
      buyingOptions: ["FIXED_PRICE"],
    };

    const result = transformEbayItem(fakeItem);
    if (result) {
      console.log(`\n✓ "${title.slice(0, 60)}"`);
      console.log(`  name: "${result.rawName}" | set: ${result.setName} | foil: ${result.isFoil} | cond: ${result.condition} | $${result.price}`);
    } else {
      console.log(`\n✗ SKIPPED: "${title.slice(0, 60)}"`);
    }
  }
}
