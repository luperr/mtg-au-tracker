/**
 * Displays a circular trend indicator badge.
 * - size="sm"   → w-4 h-4  (used inline in compact layouts)
 * - size="lg"   → w-8 h-8  (used in search result cards)
 */
export function TrendBadge({
  trend,
  size = "sm",
}: {
  trend: "up" | "down" | "neutral" | null | undefined;
  size?: "sm" | "lg";
}) {
  if (!trend) return null;

  const dim = size === "lg" ? "w-8 h-8 text-sm font-bold" : "w-4 h-4 text-[9px] font-bold";

  if (trend === "up") {
    return (
      <span className={`flex items-center justify-center rounded-full bg-red-900/40 text-red-400 ${dim}`}>↑</span>
    );
  }
  if (trend === "down") {
    return (
      <span className={`flex items-center justify-center rounded-full bg-green-900/40 text-green-400 ${dim}`}>↓</span>
    );
  }
  return (
    <span className={`flex items-center justify-center rounded-full bg-subtle/40 text-cream-dim/50 ${dim}`}>→</span>
  );
}
