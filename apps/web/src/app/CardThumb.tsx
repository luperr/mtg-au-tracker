import { CardImage } from "./CardImage";

/**
 * A small card image (want-list rows, pickers), from Scryfall's 146px "small" rendition —
 * enough for 3x screens at 36–48px, and a tenth of the original to fetch on a cold cache.
 */
export function CardThumb({ uri, className }: { uri: string | null; className: string }) {
  return <CardImage uri={uri} alt="" width={48} rendition="small" className={`rounded ${className}`} />;
}
