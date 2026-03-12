import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mtg-au/shared"],
  output: "standalone",
  experimental: {
    outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  },
};

export default nextConfig;
