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
  // Card art: resized WebP via /_next/image, cached by Cloudflare (see "Card images" in CLAUDE.md).
  images: {
    // Originals come through the local /api/scryfall-image route, not remotePatterns: the
    // optimizer's own remote fetch can't send the User-Agent Scryfall requires. Nothing else
    // local may be optimised, and Next 16 requires this for query-string srcs.
    localPatterns: [{ pathname: "/api/scryfall-image/**" }],
    // No AVIF: ~10x slower to encode, and cold resizes run on the home server.
    formats: ["image/webp"],
    // Proxied URLs keep Scryfall's version query, so a resized image never changes. The disk
    // cache is an LRU capped below the 512m tmpfs it lives on (docker-compose.prod.yml).
    minimumCacheTTL: 31536000,
    maximumDiskCacheSize: 400 * 1024 * 1024,
    // Few widths: fewer variants to resize, more Cloudflare hits. Nothing above 488 (Scryfall
    // "normal") differs, as the optimizer never enlarges.
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
