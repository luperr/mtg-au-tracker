// Scryfall card-image URLs ↔ our proxy path (app/api/scryfall-image). Pure, relative imports
// only, so tests load it without next/image.

import { SCRYFALL_IMAGE_ORIGIN } from "./config";

/** Scryfall's "normal" rendition — the largest any page shows, and the card's ratio. */
export const CARD_IMAGE_WIDTH = 488;
export const CARD_IMAGE_HEIGHT = 680;

/** A Scryfall card-image path and nothing else: size / face / two hash dirs / id.ext. */
export const CARD_IMAGE_PATH = /^(small|normal|large|png|art_crop|border_crop)\/(front|back)\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.(jpg|png)$/;

/**
 * A Scryfall card image as our proxy path, which the optimizer reads in-process — or null for
 * any other URL (a placeholder like errors.scryfall.com/soon.jpg). `small` swaps in Scryfall's
 * 146px rendition: thumbnails don't need the 488px original fetched and resized on a cold cache.
 */
export function proxiedCardSrc(uri: string, rendition: "normal" | "small" = "normal"): string | null {
  if (!uri.startsWith(`${SCRYFALL_IMAGE_ORIGIN}/`)) return null;
  const path = uri.slice(SCRYFALL_IMAGE_ORIGIN.length + 1);
  return "/api/scryfall-image/" + (rendition === "small" ? path.replace(/^normal\//, "small/") : path);
}

/** next/image's src for a card: the proxied path, or the URL as-is with the optimizer bypassed. */
export function cardImageProps(uri: string, rendition: "normal" | "small" = "normal"): { src: string; unoptimized: boolean } {
  const proxied = proxiedCardSrc(uri, rendition);
  return proxied ? { src: proxied, unoptimized: false } : { src: uri, unoptimized: true };
}
