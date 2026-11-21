import Image from "next/image";
import { MTG_CARD_ASPECT_RATIO } from "@/lib/config";
import { CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH, cardImageProps } from "@/lib/card-image";

/**
 * Card art through Next's image optimizer, served as resized WebP from our domain (see
 * "Card images" in CLAUDE.md). A blank card-shaped box when there's no image.
 *
 * Give `sizes` for art that scales with the layout (tiles), or `width` in CSS px for art drawn
 * at a fixed size (thumbnails, the card page, popups) — fixed widths list only the 1x/2x files.
 * `priority` only for what's on screen at load; it preloads at high priority.
 */
export function CardImage({
  uri, alt, sizes, width, className = "", style, priority = false, rendition = "normal",
}: {
  uri: string | null;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
  rendition?: "normal" | "small";
} & ({ sizes: string; width?: never } | { width: number; sizes?: never })) {
  const box = { aspectRatio: MTG_CARD_ASPECT_RATIO, ...style };
  if (!uri) return <div className={`bg-muted ${className}`} style={box} />;
  const w = width ?? CARD_IMAGE_WIDTH;
  return (
    <Image
      {...cardImageProps(uri, rendition)}
      alt={alt}
      width={w}
      height={Math.round((w * CARD_IMAGE_HEIGHT) / CARD_IMAGE_WIDTH)}
      sizes={sizes}
      priority={priority}
      className={className}
      style={box}
    />
  );
}
