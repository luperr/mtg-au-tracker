import type { SetMetadata, SetPriceTimelinePoint } from "@/lib/db";
import { fmtAUD } from "@/lib/utils";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Percentage change from first to last timeline point. */
function computeOverallChange(timeline: SetPriceTimelinePoint[]): number | null {
  if (timeline.length < 2) return null;
  const first = parseFloat(timeline[0].total_value);
  const last = parseFloat(timeline[timeline.length - 1].total_value);
  if (!first) return null;
  return ((last - first) / first) * 100;
}

export function SetHero({
  meta,
  timeline,
}: {
  meta: SetMetadata;
  timeline: SetPriceTimelinePoint[];
}) {
  const currentValue =
    timeline.length > 0
      ? parseFloat(timeline[timeline.length - 1].total_value)
      : null;
  const overallChange = computeOverallChange(timeline);

  const changePositive = overallChange !== null && overallChange > 0;
  const changeLabel =
    overallChange !== null
      ? `${changePositive ? "+" : ""}${overallChange.toFixed(1)}% since release`
      : null;

  return (
    <div className="mb-8">
      {/* Breadcrumb */}
      <div className="text-[11px] text-cream-dim/40 mb-4">
        <a href="/sets" className="hover:text-accent transition-colors">
          Sets
        </a>
        <span className="mx-1.5">›</span>
        <span>{meta.set_name}</span>
      </div>

      <div className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Set icon */}
          <div className="flex items-center gap-3 sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://svgs.scryfall.io/sets/${meta.set_code}.svg`}
              alt={meta.set_name}
              width={52}
              height={52}
              className="shrink-0 opacity-80"
              style={{ filter: "invert(55%) sepia(30%) saturate(400%) hue-rotate(155deg)" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <span className="sm:hidden text-[11px] text-cream-dim/40 uppercase tracking-widest font-mono">
              {meta.set_code.toUpperCase()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Set name + code */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-cream leading-tight">
                {meta.set_name}
              </h1>
              <span className="hidden sm:inline text-[11px] text-cream-dim/40 uppercase tracking-widest font-mono">
                {meta.set_code.toUpperCase()}
              </span>
            </div>
            <div className="text-xs text-cream-dim/50 mt-0.5">
              Released {formatDate(meta.released_at)}
            </div>

            {/* Stats row */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Total value */}
              <div className="col-span-2 sm:col-span-1 rounded-lg bg-price-muted/60 border border-price/20 px-3 py-2.5">
                <div className="text-[10px] text-cream-dim/40 uppercase tracking-wider mb-0.5">
                  Set value
                </div>
                <div className="text-xl font-bold text-price">
                  {currentValue != null ? fmtAUD(currentValue) : "—"}
                </div>
                {changeLabel && (
                  <div
                    className={`text-[11px] mt-0.5 font-medium ${
                      changePositive ? "text-red-400" : "text-green-400"
                    }`}
                  >
                    {changeLabel}
                  </div>
                )}
              </div>

              {/* Cards */}
              <div className="rounded-lg bg-muted border border-subtle px-3 py-2.5">
                <div className="text-[10px] text-cream-dim/40 uppercase tracking-wider mb-0.5">
                  Cards
                </div>
                <div className="text-lg font-bold text-cream">{meta.unique_cards}</div>
                <div className="text-[10px] text-cream-dim/40">unique</div>
              </div>

              {/* Mythics */}
              <div className="rounded-lg bg-muted border border-subtle px-3 py-2.5">
                <div className="text-[10px] text-cream-dim/40 uppercase tracking-wider mb-0.5">
                  Mythics
                </div>
                <div className="text-lg font-bold text-cream">{meta.mythic_count}</div>
                <div className="text-[10px] text-cream-dim/40">{meta.rare_count} rares</div>
              </div>

              {/* Data range */}
              <div className="rounded-lg bg-muted border border-subtle px-3 py-2.5">
                <div className="text-[10px] text-cream-dim/40 uppercase tracking-wider mb-0.5">
                  Data points
                </div>
                <div className="text-lg font-bold text-cream">{timeline.length}</div>
                <div className="text-[10px] text-cream-dim/40">daily snapshots</div>
              </div>
            </div>
          </div>
        </div>

        {/* No data notice */}
        {timeline.length === 0 && (
          <div className="mt-4 rounded-lg bg-muted border border-subtle px-3 py-2 text-[11px] text-cream-dim/50">
            No price history yet for this set. Price charts will appear after the first scrape run.
          </div>
        )}
      </div>
    </div>
  );
}
