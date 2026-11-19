import { MTG_CARD_ASPECT_RATIO } from "@/lib/config";
import { toSmallImage } from "@/lib/utils";

/**
 * A small card image at the card's aspect ratio, or a blank card-shaped placeholder.
 * Loads Scryfall's "small" rendition — these show at 40–48px, and the stored "normal"
 * URI is a ~488px file.
 */
export function CardThumb({ uri, className }: { uri: string | null; className: string }) {
  const src = toSmallImage(uri);
  return src ? (
    <img src={src} alt="" loading="lazy" className={`rounded ${className}`} style={{ aspectRatio: MTG_CARD_ASPECT_RATIO }} />
  ) : (
    <div className={`rounded bg-muted ${className}`} style={{ aspectRatio: MTG_CARD_ASPECT_RATIO }} />
  );
}
