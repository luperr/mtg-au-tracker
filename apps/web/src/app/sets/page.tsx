import type { Metadata } from "next";
import { getSetList } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set Releases | Scrymarket",
  description: "Browse MTG set releases and track price movements across Australian stores.",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    month: "short",
    year: "numeric",
  });
}

export default async function SetsPage() {
  const sets = await getSetList();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-cream mb-1">Set Releases</h1>
        <p className="text-sm text-cream-dim/60">
          Price data across {sets.length} sets stocked in Australian stores.
          Click a set to see the full price story.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map((set) => {
          const value = set.total_value ? parseFloat(set.total_value) : null;
          const coverage =
            set.unique_cards > 0
              ? Math.round((set.in_stock_cards / set.unique_cards) * 100)
              : 0;

          return (
            <a
              key={set.set_code}
              href={`/sets/${set.set_code}`}
              className="group block rounded-lg border border-subtle bg-surface p-4 hover:border-accent-border hover:bg-accent-muted transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Set icon */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://svgs.scryfall.io/sets/${set.set_code}.svg`}
                  alt={set.set_name}
                  width={28}
                  height={28}
                  className="shrink-0 mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity"
                  style={{ filter: "invert(60%) sepia(20%) saturate(300%) hue-rotate(160deg)" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-cream text-sm leading-tight truncate">
                    {set.set_name}
                  </div>
                  <div className="text-[11px] text-cream-dim/50 mt-0.5 uppercase tracking-wide">
                    {set.set_code} · {formatDate(set.released_at)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-[10px] text-cream-dim/40 uppercase tracking-wider">
                    Set value
                  </div>
                  <div className="text-lg font-bold text-price">
                    {value != null ? `$${value.toFixed(0)}` : "—"}
                    <span className="text-[10px] text-cream-dim/40 font-normal ml-1">AUD</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-cream-dim/40 uppercase tracking-wider">
                    Coverage
                  </div>
                  <div className="text-sm font-semibold text-cream-dim">
                    {coverage}%
                    <span className="text-[10px] text-cream-dim/40 font-normal ml-1">
                      ({set.in_stock_cards}/{set.unique_cards})
                    </span>
                  </div>
                </div>
              </div>

              {/* Coverage bar */}
              <div className="mt-2 h-0.5 rounded-full bg-subtle overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${coverage}%` }}
                />
              </div>
            </a>
          );
        })}
      </div>

      {sets.length === 0 && (
        <div className="text-center py-16 text-cream-dim/40 text-sm">
          No sets with AU store data yet. Check back after the next scrape run.
        </div>
      )}
    </div>
  );
}
