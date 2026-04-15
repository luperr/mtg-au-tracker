"use client";

import { useState, type SyntheticEvent } from "react";
import { RARITY_FILTER, RARITY_FALLBACK_COLOR } from "@/lib/rarity";

interface SetSymbolProps {
  setCode: string;
  setName: string;
  rarity?: string;
  size?: number;
  className?: string;
}

export function SetSymbol({
  setCode,
  setName,
  rarity = "rare",
  size = 18,
  className = "shrink-0",
}: SetSymbolProps) {
  const [failed, setFailed] = useState(false);
  const color = RARITY_FALLBACK_COLOR[rarity] ?? RARITY_FALLBACK_COLOR.common;

  function onError(e: SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.style.display = "none";
    setFailed(true);
  }

  if (failed) {
    return (
      <span
        style={{ color, fontSize: size * 0.8, width: size, textAlign: "center", display: "inline-block" }}
        title={setName}
      >
        ❖
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://svgs.scryfall.io/sets/${setCode}.svg`}
      alt={setName}
      width={size}
      height={size}
      className={className}
      style={{ filter: RARITY_FILTER[rarity] ?? RARITY_FILTER.common }}
      loading="lazy"
      onError={onError}
    />
  );
}
