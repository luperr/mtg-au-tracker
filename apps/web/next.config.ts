import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://umami.scrymarket.au https://cdnjs.buymeacoffee.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com",
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
