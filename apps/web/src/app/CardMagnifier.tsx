"use client";

import { useRef, useState } from "react";

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
    const rect = wrapperRef.current.getBoundingClientRect();
    const popupW = 380;
    const popupH = 530;

    const spaceRight = window.innerWidth - rect.right;
    let left = spaceRight >= popupW + 16
      ? rect.right + 8
      : rect.left - popupW - 8;
    left = Math.max(8, Math.min(left, window.innerWidth - popupW - 8));

    const thumbMidY = rect.top + rect.height / 2;
    let top = thumbMidY - popupH / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - popupH - 8));

    return { top, left };
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

      {show && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={largeSrc}
            alt={alt}
            width={380}
            className="rounded-xl shadow-2xl shadow-black/80 border border-subtle"
          />
        </div>
      )}
    </>
  );
}
