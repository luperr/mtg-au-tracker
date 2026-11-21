import Image from "next/image";
import { MTG_CARD_ASPECT_RATIO, SCRYFALL_IMAGE_ORIGIN } from "@/lib/config";

/**
 * A Scryfall image URL as our local proxy path (app/api/scryfall-image), which the optimizer
 * resizes in-process. Anything else passes through unchanged.
 */
export function cardImageSrc(uri: string): string {
  return uri.startsWith(`${SCRYFALL_IMAGE_ORIGIN}/`) ? `/api/scryfall-image/${uri.slice(SCRYFALL_IMAGE_ORIGIN.length + 1)}` : uri;
}

/**
 * Card art from Scryfall, through Next's image optimizer: resized to the width the screen
 * needs and served as WebP from our own domain, where Cloudflare caches it at the AU edge.
 * The optimizer reads the original through our proxy route, which sends the User-Agent
 * Scryfall requires (see app/api/scryfall-image).
 * Hotlinked, the same tile was an 80–160KB JPEG behind a ~1s first byte from Scryfall's CDN.
 *
 * `sizes` is how wide the image renders — it picks the file, so set it honestly. `priority`
 * for images above the fold (the first row of results, the card page's main image), which
 * otherwise wait for lazy loading.
 */
export function CardImage({
  uri, alt, sizes, className = "", priority = false, placeholder = null,
}: {
  uri: string | null;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
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
  return (
    <Image
      src={cardImageSrc(uri)}
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
