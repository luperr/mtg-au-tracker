import { CardImage } from "./CardImage";

/**
 * A small card image at the card's aspect ratio, or a blank card-shaped placeholder —
 * want-list rows and pickers, 36–48px wide. Through the optimizer like all card art, from
 * Scryfall's 146px "small" rendition: enough for 3x screens, and a tenth of the original
 * to fetch and resize on a cold cache.
 */
export function CardThumb({ uri, className }: { uri: string | null; className: string }) {
  return <CardImage uri={uri} alt="" sizes="48px" rendition="small" className={`rounded ${className}`} />;
}
