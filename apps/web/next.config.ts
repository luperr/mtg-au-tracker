import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://umami.scrymarket.au",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://umami.scrymarket.au",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve("../../"),
  transpilePackages: ["@mtg-au/shared"],
  // Card art goes through /_next/image (app/CardImage.tsx): resized, WebP, and cached by
  // Cloudflare at the AU edge — Scryfall's own CDN is ~1s to first byte from Australia.
  // A Cloudflare Cache Rule makes /_next/image cacheable; it has no file extension, so by
  // default Cloudflare passes it through.
  images: {
    // No remotePatterns: card art is fetched through the local /api/scryfall-image proxy,
    // because the optimizer's own remote fetch can't send the User-Agent Scryfall requires.
    // No AVIF: ~10x slower to encode, and cold resizes run on the home server.
    formats: ["image/webp"],
    // Only our proxy route may be optimised (and its version query is allowed). Without this,
    // /_next/image?url=/api/<anything> runs any local route through the optimizer, and
    // Next 16 requires it for query-string srcs.
    localPatterns: [{ pathname: "/api/scryfall-image/**" }],
    // A week, in the web container's tmpfs and at Cloudflare's edge. Not a year: Next 15 never
    // evicts its image cache by size, only once an entry goes stale, so this bounds how long a
    // resized image can sit in RAM (the tmpfs is size-capped in docker-compose.prod.yml too).
    minimumCacheTTL: 604800,
    // Few widths: fewer variants to resize, more Cloudflare hits. Scryfall "normal" is 488 wide
    // and the optimizer never enlarges, so nothing above 488 would differ.
    imageSizes: [64, 128, 256],
    deviceSizes: [384, 488],
  },
  webpack(config) {
    // transpilePackages processes @mtg-au/shared TypeScript source via webpack,
    // but webpack doesn't resolve .js → .ts by default (unlike TypeScript's
    // "moduleResolution: bundler"). extensionAlias teaches it to do so.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".js", ".ts"],
      ".jsx": [".jsx", ".tsx"],
    };
    return config;
  },
  async headers() {
    return [
      {
        // Security headers on all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Public folder assets (favicons, images, etc.) — long-lived cache
        source: "/:path+.(ico|png|jpg|jpeg|svg|webp|woff|woff2|ttf|otf)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;
