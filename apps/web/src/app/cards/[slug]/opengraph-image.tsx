import { ImageResponse } from "next/og";
import { getCardMetadata } from "@/lib/db";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function CardOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = await getCardMetadata(slug);

  const cardName = meta?.name ?? "Magic Card";
  const typeLine = meta?.type_line ?? "";
  const priceStr = meta?.cheapest_price
    ? `From $${parseFloat(meta.cheapest_price).toFixed(2)} AUD`
    : null;
  const storeStr = meta?.store_count
    ? `${meta.store_count} Australian store${meta.store_count !== 1 ? "s" : ""}`
    : null;
  const imageUri = meta?.image_uri ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#12151c",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 5,
            background: "linear-gradient(90deg, #257180, #FD8B51)",
          }}
        />

        {/* Left: card info */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            padding: "60px 48px 60px 60px",
          }}
        >
          {/* Scrymarket label */}
          <div
            style={{
              fontSize: 18,
              color: "#5ce0d8",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            SCRYMARKET · AU Price Tracker
          </div>

          {/* Card name */}
          <div
            style={{
              fontSize: cardName.length > 20 ? 44 : 56,
              fontWeight: 700,
              color: "#e2e4ea",
              lineHeight: 1.1,
              marginBottom: 16,
            }}
          >
            {cardName}
          </div>

          {/* Type line */}
          {typeLine && (
            <div
              style={{
                fontSize: 20,
                color: "#8b90a0",
                marginBottom: 28,
              }}
            >
              {typeLine}
            </div>
          )}

          {/* Price badge */}
          {priceStr && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(74,222,128,0.12)",
                border: "1px solid rgba(74,222,128,0.25)",
                borderRadius: 8,
                padding: "12px 20px",
                fontSize: 32,
                fontWeight: 700,
                color: "#4ade80",
                width: "fit-content",
                marginBottom: 16,
              }}
            >
              {priceStr}
            </div>
          )}

          {/* Store count */}
          {storeStr && (
            <div style={{ fontSize: 18, color: "#8b90a0" }}>
              Compared across {storeStr}
            </div>
          )}
        </div>

        {/* Right: card image */}
        {imageUri && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "48px 60px 48px 0",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUri}
              width={240}
              height={336}
              style={{ borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
              alt={cardName}
            />
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: 60,
            fontSize: 14,
            color: "#4a4f5e",
          }}
        >
          Card image © Wizards of the Coast, sourced via Scryfall
        </div>
      </div>
    ),
    { ...size }
  );
}
