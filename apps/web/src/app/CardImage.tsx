import Image from "next/image";
import { MTG_CARD_ASPECT_RATIO } from "@/lib/config";
import { proxiedCardSrc } from "@/lib/card-image";

/**
 * Card art from Scryfall, through Next's image optimizer: resized to the width the screen
 * needs and served as WebP from our own domain, where Cloudflare caches it at the AU edge.
 * Hotlinked, the same tile was an 80–160KB JPEG behind a ~1s first byte from Scryfall's CDN.
 * A non-Scryfall URL bypasses the optimizer (`unoptimized`) rather than failing.
 *
 * `sizes` is how wide the image renders — it picks the file, so set it honestly. `priority`
 * only for the image that's on screen at load (the first results row, the card page's
 * initial image); it preloads at high priority.
 */
export function CardImage({
  uri, alt, sizes, className = "", priority = false, rendition = "normal", placeholder = null,
}: {
  uri: string | null;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  rendition?: "normal" | "small";
  /** Shown when there's no image; null for a blank card-shaped box. */
  placeholder?: React.ReactNode;
}) {
  if (!uri) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`} style={{ aspectRatio: MTG_CARD_ASPECT_RATIO }}>
        {placeholder}
      </div>
    );
  }
  const proxied = proxiedCardSrc(uri, rendition);
  return (
    <Image
      src={proxied ?? uri}
      unoptimized={proxied === null}
      alt={alt}
      // Scryfall "normal" is 488×680; these set the ratio, not the rendered size.
      width={488}
      height={680}
      sizes={sizes}
      priority={priority}
      className={className}
      style={{ aspectRatio: MTG_CARD_ASPECT_RATIO }}
    />
  );
}
