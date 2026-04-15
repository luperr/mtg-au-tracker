"use client";

import { CardMagnifier } from "./CardMagnifier";

interface Props {
  imageUri: string | null;
  alt: string;
  /** Tailwind classes that set the container size, e.g. "w-7 h-10" or "w-[44px] h-[61px] sm:w-[63px] sm:h-[88px]" */
  className: string;
  /** Delay before the magnifier popup appears. Defaults to 300ms. */
  delayMs?: number;
}

function toSmallImage(uri: string): string {
  return uri.replace("/normal/", "/small/");
}

/**
 * Card thumbnail with hover magnifier. Pass the normal-sized Scryfall URI;
 * the small variant is derived automatically. Size the thumbnail via className.
 */
export function CardThumb({ imageUri, alt, className, delayMs = 300 }: Props) {
  if (!imageUri) {
    return (
      <div className={`rounded bg-muted flex items-center justify-center text-cream-dim/40 text-xs shrink-0 ${className}`}>
        ?
      </div>
    );
  }

  return (
    <div className={`rounded overflow-hidden shrink-0 ${className}`}>
      <CardMagnifier
        smallSrc={toSmallImage(imageUri)}
        largeSrc={imageUri}
        alt={alt}
        delayMs={delayMs}
      />
    </div>
  );
}
