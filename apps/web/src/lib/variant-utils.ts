export type VariantTag =
  | "standard"
  | "foil"
  | "etched"
  | "borderless"
  | "borderless-foil"
  | "showcase"
  | "extendedart"
  | "fullart";

export const VARIANT_LABELS: Record<VariantTag, string> = {
  standard:        "Standard",
  foil:            "Foil",
  etched:          "Etched",
  borderless:      "Borderless",
  "borderless-foil": "Borderless Foil",
  showcase:        "Showcase",
  extendedart:     "Extended Art",
  fullart:         "Full Art",
};

export const VARIANT_ORDER: VariantTag[] = [
  "standard", "foil", "etched", "borderless", "borderless-foil",
  "showcase", "extendedart", "fullart",
];

type VariantSource = {
  finish: string;
  borderColor: string | null | undefined;
  frameEffects: string[];
};

export function getVariantTags(p: VariantSource): Set<VariantTag> {
  const tags = new Set<VariantTag>();
  const isBorderless = p.borderColor === "borderless";
  const isSpecialFrame =
    p.frameEffects.includes("showcase") ||
    p.frameEffects.includes("extendedart") ||
    p.frameEffects.includes("fullart");

  if (p.frameEffects.includes("showcase"))    tags.add("showcase");
  if (p.frameEffects.includes("extendedart")) tags.add("extendedart");
  if (p.frameEffects.includes("fullart"))     tags.add("fullart");
  if (isBorderless && p.finish !== "nonfoil") tags.add("borderless-foil");
  else if (isBorderless)                      tags.add("borderless");
  if (p.finish === "etched")                  tags.add("etched");
  if (p.finish === "foil" && !isBorderless && !isSpecialFrame)    tags.add("foil");
  if (p.finish === "nonfoil" && !isBorderless && !isSpecialFrame) tags.add("standard");
  return tags;
}

export function variantBadge(p: VariantSource): string | null {
  const tags = getVariantTags(p);
  if (tags.has("borderless-foil")) return "Borderless Foil";
  if (tags.has("borderless"))      return "Borderless";
  if (tags.has("etched"))          return "Etched";
  if (tags.has("showcase"))        return p.finish !== "nonfoil" ? "Showcase Foil" : "Showcase";
  if (tags.has("extendedart"))     return p.finish !== "nonfoil" ? "Extended Art Foil" : "Extended Art";
  if (tags.has("fullart"))         return p.finish !== "nonfoil" ? "Full Art Foil" : "Full Art";
  return null; // standard and foil shown via other UI cues
}
