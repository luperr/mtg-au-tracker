"use client";

import { useRef, useState } from "react";

interface Props {
  smallSrc: string;
  largeSrc: string;
  alt: string;
}

export function CardMagnifier({ smallSrc, largeSrc, alt }: Props) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  function open() {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const popupW = 380;
    const popupH = 530; // approx height of card at 380px wide

    // Prefer right side, fall back to left
    const spaceRight = window.innerWidth - rect.right;
    let left = spaceRight >= popupW + 16
      ? rect.right + 8
      : rect.left - popupW - 8;
    // Clamp horizontally
    left = Math.max(8, Math.min(left, window.innerWidth - popupW - 8));

    // Centre vertically on the thumbnail, clamp to viewport
    // rect.top is already viewport-relative; fixed positioning needs viewport coords (no scrollY)
    const thumbMidY = rect.top + rect.height / 2;
    let top = thumbMidY - popupH / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - popupH - 8));

    setPos({ top, left });
    setShow(true);
  }

  function close() {
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
