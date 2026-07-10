"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

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
// The fixed-position card image rendered by every preview popup.

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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={uri}
      alt={alt}
      width={width}
      className="fixed pointer-events-none rounded-xl shadow-2xl shadow-black/80 border border-subtle"
      style={{ top, left, zIndex }}
    />
  );
}

// ── CardMagnifier — thumbnail that pops up a large image on hover ─────────────

interface Props {
  smallSrc: string;
  largeSrc: string;
  alt: string;
  /** Milliseconds to wait before showing the popup. Defaults to 0 (immediate). */
  delayMs?: number;
}

export function CardMagnifier({ smallSrc, largeSrc, alt, delayMs = 0 }: Props) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function computePos() {
    if (!wrapperRef.current) return null;
    return computePopupPos(wrapperRef.current.getBoundingClientRect(), 380, 530);
  }

  function open() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (delayMs > 0) {
      timerRef.current = setTimeout(() => {
        const p = computePos();
        if (p) { setPos(p); setShow(true); }
      }, delayMs);
    } else {
      const p = computePos();
      if (p) { setPos(p); setShow(true); }
    }
  }

  function close() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  }

  return (
    <>
      <div
        ref={wrapperRef}
        className="w-full h-full"
        onMouseEnter={open}
        onMouseLeave={close}
        onClick={(e) => {
          e.preventDefault();
          show ? close() : open();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={smallSrc}
          alt={alt}
          className="w-full h-full object-cover object-top"
          loading="lazy"
        />
      </div>

      {show && <CardImagePopup uri={largeSrc} top={pos.top} left={pos.left} width={380} alt={alt} />}
    </>
  );
}

// ── HoverCardPopup — wraps arbitrary children and shows a card image on hover ─
// Use this when the trigger is text or a non-thumbnail element (e.g. card name).

interface HoverCardPopupProps {
  imageSrc: string;
  alt: string;
  /** Delay in ms before the popup appears. Default: 0. */
  delay?: number;
  children?: ReactNode;
}

export function HoverCardPopup({ imageSrc, alt, delay = 0, children }: HoverCardPopupProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function open() {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    if (delay === 0) {
      setPos(computePopupPos(rect, 380, 530));
      setShow(true);
      return;
    }
    timerRef.current = setTimeout(() => {
      // Re-read rect in case the element moved (e.g. scroll)
      if (!wrapperRef.current) return;
      setPos(computePopupPos(wrapperRef.current.getBoundingClientRect(), 380, 530));
      setShow(true);
    }, delay);
  }

  function close() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setShow(false);
  }

  return (
    <>
      <span ref={wrapperRef} onMouseEnter={open} onMouseLeave={close}>
        {children}
      </span>
      {show && <CardImagePopup uri={imageSrc} top={pos.top} left={pos.left} width={380} alt={alt} />}
    </>
  );
}
