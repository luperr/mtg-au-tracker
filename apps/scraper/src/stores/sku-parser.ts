/**
 * SKU parsing shared by all Shopify title-format parsers.
 *
 * Three known SKU formats used by AU Shopify MTG stores:
 *
 * Format A — Good Games / Plenty of Games:
 *   {SET}-{COLLECTOR}-{LANG}-{FINISH}-{CONDITION_NUM}
 *   e.g. "MOC-381-EN-NF-1", "LTR-123-EN-F-2"
 *   FINISH: NF = non-foil; F, FO, FOIL = foil
 *
 * Format B — Gameology:
 *   MTG-{SET}-{COLLECTOR}-{RANDOM_SUFFIX}
 *   e.g. "MTG-TLA-336-01WREUQWQQ"
 *   Foil is determined from product tags instead.
 *
 * Format C — Mega Games:
 *   {SET}-{RARITY}-{COLOR}-{COLLECTOR}-{FINISH}
 *   e.g. "SOS-C-L-0267-N", "SOS-C-G-0162-F"
 *   FINISH: N = non-foil; F = foil.
 */

export interface SkuData {
  setCode: string | null;
  collectorNumber: string | null;
  isFoil: boolean | null; // null = could not determine from SKU alone
}

const NON_FOIL_FINISHES = new Set(["NF", "NONFOIL", "NON-FOIL"]);

export function parseSkuData(sku: string | null | undefined): SkuData {
  if (!sku) return { setCode: null, collectorNumber: null, isFoil: null };

  // Format A: SET-COLLECTOR-LANG-FINISH-CONDITION  e.g. "MOC-381-EN-NF-1"
  // Handles DFC collector numbers:  "MH3-244//244-EN-NF-1" (the //NNN part is ignored)
  // Handles letter-suffixed collector numbers: "PTHB-244S-EN-FO-1" (lowercased to "244s")
  const formatA = sku.match(/^([A-Z0-9]{2,6})-(\d{1,4}[a-zA-Z]?)(?:\/\/\d+)?-[A-Z]{2}-([A-Z-]+)-\d+$/i);
  if (formatA) {
    const finish = formatA[3].toUpperCase();
    return {
      setCode: formatA[1].toLowerCase(),
      collectorNumber: formatA[2].toLowerCase(),
      isFoil: !NON_FOIL_FINISHES.has(finish),
    };
  }

  // Format B: MTG-SET-COLLECTOR-RANDOMSUFFIX  e.g. "MTG-TLA-336-01WREUQWQQ"
  const formatB = sku.match(/^MTG-([A-Z0-9]{2,6})-(\d{1,4}[a-z]?)-/i);
  if (formatB) {
    return {
      setCode: formatB[1].toLowerCase(),
      collectorNumber: formatB[2],
      isFoil: null,
    };
  }

  // Format C: SET-RARITY-TYPE-COLLECTOR-FINISH  e.g. "SOS-C-L-0267-N", "SOS-C-G-0162-F"
  // Used by Mega Games. RARITY and TYPE are 1-2 letters (e.g. "Bu" for Blue, "Bk" for Black).
  const formatC = sku.match(/^([A-Z0-9]{2,6})-[A-Z]{1,2}-[A-Z]{1,2}-(\d{1,4}[a-z]?)-([NF])$/i);
  if (formatC) {
    return {
      setCode: formatC[1].toLowerCase(),
      collectorNumber: String(parseInt(formatC[2], 10)),
      isFoil: formatC[3].toUpperCase() === "F",
    };
  }

  return { setCode: null, collectorNumber: null, isFoil: null };
}
