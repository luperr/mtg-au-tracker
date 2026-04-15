import { ImageResponse } from "next/og";
import {
  getSetMetadata,
  getSetPriceTimeline,
  getSetCardPerformance,
} from "@/lib/db";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function fetchSvgAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return `data:image/svg+xml;base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function SetOgImage({
  params,
}: {
  params: Promise<{ setCode: string }>;
}) {
  const { setCode } = await params;

  const [meta, timeline, cardPerf] = await Promise.all([
    getSetMetadata(setCode),
    getSetPriceTimeline([setCode]),
    getSetCardPerformance([setCode]),
  ]);

  const setName = meta?.set_name ?? "MTG Set";
  const setIconUrl = `https://svgs.scryfall.io/sets/${setCode}.svg`;
  const iconData = await fetchSvgAsDataUrl(setIconUrl);

  // Compute key stats
  const currentValue =
    timeline.length > 0
      ? parseFloat(timeline[timeline.length - 1].total_value)
      : null;
  const firstValue =
    timeline.length > 1 ? parseFloat(timeline[0].total_value) : null;
  const changePct =
    firstValue && currentValue
      ? ((currentValue - firstValue) / firstValue) * 100
      : null;

  const topGainer =
    cardPerf.length > 0 && cardPerf[0].pct_change != null
      ? cardPerf[0]
      : null;
  const topLoser =
    cardPerf.length > 0
      ? [...cardPerf]
          .filter((c) => c.pct_change != null && parseFloat(c.pct_change) < 0)
          .sort((a, b) => parseFloat(a.pct_change!) - parseFloat(b.pct_change!))
          .at(0) ?? null
      : null;

  const changeLabel =
    changePct != null
      ? `${changePct > 0 ? "+" : ""}${changePct.toFixed(0)}% since release`
      : null;
  const changeColor =
    changePct != null && changePct < 0 ? "#4ade80" : "#f87171";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#12100e",
          fontFamily: "sans-serif",
          padding: "0",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            height: 5,
            background: "linear-gradient(90deg, #257180, #FD8B51)",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", flex: 1, padding: "52px 64px 48px" }}>
          {/* Left column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              paddingRight: 48,
            }}
          >
            {/* Label */}
            <div
              style={{
                display: "flex",
                fontSize: 15,
                color: "#5ce0d8",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 20,
              }}
            >
              SCRYMARKET · AU Market Breakdown
            </div>

            {/* Set icon + name */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                marginBottom: 28,
              }}
            >
              {iconData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={iconData}
                  width={56}
                  height={56}
                  style={{ opacity: 0.85 }}
                  alt={setName}
                />
              ) : null}
              <div
                style={{
                  fontSize: setName.length > 24 ? 38 : 48,
                  fontWeight: 700,
                  color: "#e8dece",
                  lineHeight: 1.15,
                  display: "flex",
                }}
              >
                {setName}
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 24, marginBottom: 32 }}>
              {currentValue != null && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    background: "rgba(253,139,81,0.12)",
                    border: "1px solid rgba(253,139,81,0.25)",
                    borderRadius: 10,
                    padding: "14px 20px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "#8a8070",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      display: "flex",
                      marginBottom: 4,
                    }}
                  >
                    Set value
                  </span>
                  <span
                    style={{
                      fontSize: 30,
                      fontWeight: 700,
                      color: "#FD8B51",
                      display: "flex",
                    }}
                  >
                    ${currentValue.toFixed(0)} AUD
                  </span>
                </div>
              )}

              {changeLabel && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10,
                    padding: "14px 20px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "#8a8070",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      display: "flex",
                      marginBottom: 4,
                    }}
                  >
                    Change
                  </span>
                  <span
                    style={{
                      fontSize: 30,
                      fontWeight: 700,
                      color: changeColor,
                      display: "flex",
                    }}
                  >
                    {changeLabel}
                  </span>
                </div>
              )}
            </div>

            {/* Card callouts */}
            <div style={{ display: "flex", gap: 16 }}>
              {topGainer && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: 8,
                    padding: "8px 14px",
                  }}
                >
                  <span style={{ color: "#f87171", fontSize: 13, display: "flex" }}>↑</span>
                  <span style={{ color: "#e8dece", fontSize: 13, display: "flex" }}>
                    {topGainer.name}
                  </span>
                  <span
                    style={{
                      color: "#f87171",
                      fontSize: 13,
                      fontWeight: 700,
                      display: "flex",
                    }}
                  >
                    +{parseFloat(topGainer.pct_change!).toFixed(0)}%
                  </span>
                </div>
              )}
              {topLoser && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "rgba(74,222,128,0.08)",
                    border: "1px solid rgba(74,222,128,0.2)",
                    borderRadius: 8,
                    padding: "8px 14px",
                  }}
                >
                  <span style={{ color: "#4ade80", fontSize: 13, display: "flex" }}>↓</span>
                  <span style={{ color: "#e8dece", fontSize: 13, display: "flex" }}>
                    {topLoser.name}
                  </span>
                  <span
                    style={{
                      color: "#4ade80",
                      fontSize: 13,
                      fontWeight: 700,
                      display: "flex",
                    }}
                  >
                    {parseFloat(topLoser.pct_change!).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: card count */}
          {meta && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                width: 160,
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  background: "rgba(37,113,128,0.15)",
                  border: "1px solid rgba(37,113,128,0.3)",
                  borderRadius: 12,
                  padding: "16px 20px",
                  textAlign: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 40,
                    fontWeight: 700,
                    color: "#31929f",
                    display: "flex",
                    lineHeight: 1,
                  }}
                >
                  {meta.unique_cards}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#6a8a90",
                    marginTop: 4,
                    display: "flex",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  cards tracked
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#4a4030",
                  textAlign: "center",
                  display: "flex",
                }}
              >
                across AU stores
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            padding: "12px 64px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, color: "#4a4030", display: "flex" }}>
            scrymarket.com.au
          </span>
          <span style={{ fontSize: 13, color: "#4a4030", display: "flex" }}>
            AU MTG price tracker · {meta?.mythic_count ?? 0}M {meta?.rare_count ?? 0}R
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
