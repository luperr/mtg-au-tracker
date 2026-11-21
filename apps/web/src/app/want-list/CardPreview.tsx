"use client";

import { createContext, useCallback, useContext, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { CardImage } from "@/app/CardImage";
import { CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH } from "@/lib/card-image";

const WIDTH = 244;
const HEIGHT = Math.round((WIDTH * CARD_IMAGE_HEIGHT) / CARD_IMAGE_WIDTH);

/** Beside the trigger if there's room on the right, else on the left; centred and kept on screen. */
function computePopupPos(rect: DOMRect, popupW: number, popupH: number): { top: number; left: number } {
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

type HoverProps = { onMouseEnter?: (e: MouseEvent<HTMLElement>) => void; onMouseLeave?: () => void };

const CardHoverContext = createContext<{ hover: (uri: string | null) => HoverProps; hide: () => void }>({
  hover: () => ({}),
  hide: () => {},
});

/**
 * One card-image popup for the whole want list, shown on card names and thumbnails.
 * Spread `useCardHover()(imageUri)` onto anything that should preview a card.
 */
export function CardPreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<{ uri: string; top: number; left: number } | null>(null);

  const hover = useCallback((uri: string | null): HoverProps => uri
    ? {
        onMouseEnter: (e) => setPreview({ uri, ...computePopupPos(e.currentTarget.getBoundingClientRect(), WIDTH, HEIGHT) }),
        onMouseLeave: () => setPreview(null),
      }
    : {}, []);
  const hide = useCallback(() => setPreview(null), []);
  const value = useMemo(() => ({ hover, hide }), [hover, hide]);

  return (
    <CardHoverContext.Provider value={value}>
      {children}
      {preview && (
        <CardImage
          uri={preview.uri}
          alt=""
          width={WIDTH}
          className="fixed z-50 pointer-events-none rounded-xl shadow-2xl shadow-black/80 border border-subtle"
          style={{ top: preview.top, left: preview.left, width: WIDTH }}
        />
      )}
    </CardHoverContext.Provider>
  );
}

export const useCardHover = () => useContext(CardHoverContext).hover;

/** For things that unmount under the pointer (a closing menu), which never fire mouseleave. */
export const useHideCardPreview = () => useContext(CardHoverContext).hide;
