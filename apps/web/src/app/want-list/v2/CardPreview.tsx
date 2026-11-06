"use client";

import { createContext, useCallback, useContext, useState, type MouseEvent, type ReactNode } from "react";
import { computePopupPos, CardImagePopup } from "@/app/CardMagnifier";

const WIDTH = 244;
const HEIGHT = 340;

type HoverProps = { onMouseEnter?: (e: MouseEvent<HTMLElement>) => void; onMouseLeave?: () => void };

const CardHoverContext = createContext<(uri: string | null) => HoverProps>(() => ({}));

/**
 * One card-image popup for the whole v2 want list, as v1 shows on card names.
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

  return (
    <CardHoverContext.Provider value={hover}>
      {children}
      {preview && <CardImagePopup uri={preview.uri} top={preview.top} left={preview.left} width={WIDTH} />}
    </CardHoverContext.Provider>
  );
}

export const useCardHover = () => useContext(CardHoverContext);
