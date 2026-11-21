import { CardImage } from "./CardImage";

/**
 * A small card image at the card's aspect ratio, or a blank card-shaped placeholder —
 * want-list rows and pickers, 40–48px wide. Through the optimizer like all card art, so it's
 * a ~5KB WebP from the AU edge rather than Scryfall's 12KB "small" JPEG ~1s away.
 */
export function CardThumb({ uri, className }: { uri: string | null; className: string }) {
  return <CardImage uri={uri} alt="" sizes="48px" className={`rounded ${className}`} />;
}
