// Scryfall card-image URLs ↔ our proxy path (app/api/scryfall-image). Pure, relative imports
// only, so tests load it without next/image.

import { SCRYFALL_IMAGE_ORIGIN } from "./config";

export const CARD_IMAGE_PROXY = "/api/scryfall-image/";

/** A Scryfall card-image path and nothing else: size / face / two hash dirs / id.ext. */
export const CARD_IMAGE_PATH = /^(small|normal|large|png|art_crop|border_crop)\/(front|back)\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.(jpg|png)$/;

/**
 * A Scryfall card image as our proxy path, which the optimizer reads in-process — or null for
 * any other URL (a placeholder like errors.scryfall.com/soon.jpg), which is shown as-is.
 * `small` swaps in Scryfall's 146px rendition: thumbnails don't need the 488px original
 * fetched and resized on a cold cache.
 */
export function proxiedCardSrc(uri: string, rendition: "normal" | "small" = "normal"): string | null {
  if (!uri.startsWith(`${SCRYFALL_IMAGE_ORIGIN}/`)) return null;
  const path = uri.slice(SCRYFALL_IMAGE_ORIGIN.length + 1);
  return CARD_IMAGE_PROXY + (rendition === "small" ? path.replace(/^normal\//, "small/") : path);
}
