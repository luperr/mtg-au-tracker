"use client";

import { useState, type SyntheticEvent } from "react";
import { RARITY_FILTER, RARITY_FALLBACK_COLOR } from "@/lib/rarity";

export function SetSymbol({ setCode, setName, rarity }: { setCode: string; setName: string; rarity: string }) {
  const [failed, setFailed] = useState(false);
  const color = RARITY_FALLBACK_COLOR[rarity] ?? RARITY_FALLBACK_COLOR.common;

  function onError(e: SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.style.display = "none";
    setFailed(true);
  }

  if (failed) {
    return (
      <span style={{ color, fontSize: 14, width: 18, textAlign: "center", display: "inline-block" }} title={setName}>
        ❖
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://svgs.scryfall.io/sets/${setCode}.svg`}
      alt={setName}
      width={18}
      height={18}
      className="shrink-0"
      style={{ filter: RARITY_FILTER[rarity] ?? RARITY_FILTER.common }}
      loading="lazy"
      onError={onError}
    />
  );
}
