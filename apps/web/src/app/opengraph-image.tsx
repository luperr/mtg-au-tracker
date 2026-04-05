import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Scrymarket — Australian MTG Price Tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#191817",
          fontFamily: "sans-serif",
        }}
      >
        {/* Subtle top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(90deg, #257180, #FD8B51)",
          }}
        />

        {/* Card icon */}
        <div style={{ fontSize: 96, marginBottom: 32 }}>🃏</div>

        {/* Site name */}
        <div
          style={{
            fontSize: 88,
            fontWeight: 700,
            letterSpacing: "-2px",
            color: "#E8DECE",
            marginBottom: 16,
          }}
        >
          SCRYMARKET
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 32,
            color: "#a89d8a",
            letterSpacing: "1px",
          }}
        >
          Australian MTG Price Tracker
        </div>

        {/* Domain */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            fontSize: 22,
            color: "#257180",
          }}
        >
          scrymarket.au
        </div>
      </div>
    ),
    { ...size }
  );
}
