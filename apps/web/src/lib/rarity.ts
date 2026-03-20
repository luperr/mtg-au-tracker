/** CSS filters to tint black SVGs to match MTG rarity colours (metallic, slightly muted) */
export const RARITY_FILTER: Record<string, string> = {
  common:   "invert(55%) brightness(0.85) contrast(0.9)",
  uncommon: "invert(60%) sepia(25%) saturate(200%) hue-rotate(175deg) brightness(0.85) contrast(0.9)",
  rare:     "invert(65%) sepia(70%) saturate(220%) hue-rotate(8deg) brightness(0.78) contrast(0.88)",
  mythic:   "invert(50%) sepia(80%) saturate(350%) hue-rotate(338deg) brightness(0.82) contrast(0.9)",
  special:  "invert(55%) sepia(70%) saturate(400%) hue-rotate(268deg) brightness(0.82) contrast(0.9)",
  bonus:    "invert(55%) sepia(70%) saturate(400%) hue-rotate(268deg) brightness(0.82) contrast(0.9)",
};

/** Fallback hex colours for the ❖ glyph when a set SVG is unavailable */
export const RARITY_FALLBACK_COLOR: Record<string, string> = {
  common:   "#888",
  uncommon: "#8aa7b8",
  rare:     "#a8894a",
  mythic:   "#b5642a",
  special:  "#8a5fb5",
  bonus:    "#8a5fb5",
};
