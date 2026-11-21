"use client";

import Image from "next/image";
import { proxiedCardSrc } from "@/lib/card-image";

// ── Shared positioning helper ─────────────────────────────────────────────────
// Positions a popup image relative to a trigger element's rect: to the right
// if there's room, otherwise to the left, vertically centred and clamped to
// the viewport. Used by every hover/click card-image preview in the app.

export function computePopupPos(rect: DOMRect, popupW: number, popupH: number): { top: number; left: number } {
  const spaceRight = window.innerWidth - rect.right;
  let left = spaceRight >= popupW + 16
    ? rect.right + 8
    : rect.left - popupW - 8;
  left = Math.max(8, Math.min(left, window.innerWidth - popupW - 8));

  const midY = rect.top + rect.height / 2;
  let top = midY - popupH / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - popupH - 8));

  return { top, left };
}

// ── Shared popup image ────────────────────────────────────────────────────────
// The fixed-position card image rendered by every preview popup (the want list's hover preview).

export function CardImagePopup({
  uri,
  top,
  left,
  width = 380,
  zIndex = 50,
  alt = "",
}: {
  uri: string;
  top: number;
  left: number;
  width?: number;
  zIndex?: number;
  alt?: string;
}) {
  // Through the optimizer like all card art (app/CardImage.tsx), sized to the popup.
  const proxied = proxiedCardSrc(uri);
  return (
    <Image
      src={proxied ?? uri}
      unoptimized={proxied === null}
      alt={alt}
      width={width}
      height={Math.round((width * 680) / 488)}
      sizes={`${width}px`}
      className="fixed pointer-events-none rounded-xl shadow-2xl shadow-black/80 border border-subtle"
      style={{ top, left, zIndex }}
    />
  );
}
