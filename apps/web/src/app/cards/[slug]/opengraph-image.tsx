import { ImageResponse } from "next/og";
import { getCardMetadata, getStores } from "@/lib/db";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function CardOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [meta, stores] = await Promise.all([getCardMetadata(slug), getStores()]);

  const cardName = meta?.name ?? "Magic Card";
  const typeLine = meta?.type_line ?? "";
  const priceStr = meta?.cheapest_price
    ? `From $${parseFloat(meta.cheapest_price).toFixed(2)} AUD`
    : null;
  const storeCount = stores.length;
  const storeStr = storeCount > 0
    ? `${storeCount} Australian store${storeCount !== 1 ? "s" : ""}`
    : null;

  const imageData = meta?.image_uri ? await fetchImageAsDataUrl(meta.image_uri) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#12151c",
          fontFamily: "sans-serif",
        }}
      >
        {/* Left: card image */}
        {imageData ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "48px 0 48px 60px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageData}
              width={240}
              height={336}
              style={{ borderRadius: 12 }}
              alt={cardName}
            />
          </div>
        ) : null}

        {/* Right: card info */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            padding: "60px 60px 60px 48px",
          }}
        >
          {/* Accent bar */}
          <div
            style={{
              display: "flex",
              height: 4,
              background: "linear-gradient(90deg, #257180, #FD8B51)",
              marginBottom: 32,
              borderRadius: 2,
            }}
          />

          {/* Scrymarket label */}
          <div
            style={{
              display: "flex",
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
              display: "flex",
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
          {typeLine ? (
            <div
              style={{
                display: "flex",
                fontSize: 20,
                color: "#8b90a0",
                marginBottom: 28,
              }}
            >
              {typeLine}
            </div>
          ) : null}

          {/* Price badge */}
          {priceStr ? (
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
                marginBottom: 16,
              }}
            >
              {priceStr}
            </div>
          ) : null}

          {/* Store count */}
          {storeStr ? (
            <div style={{ display: "flex", fontSize: 18, color: "#8b90a0" }}>
              Compared across {storeStr}
            </div>
          ) : null}

          {/* Footer */}
          <div
            style={{
              display: "flex",
              fontSize: 13,
              color: "#4a4f5e",
              marginTop: "auto",
              paddingTop: 32,
            }}
          >
            Card image © Wizards of the Coast, sourced via Scryfall
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
