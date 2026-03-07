import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mtg-au/shared"],
  output: "standalone",
};

export default nextConfig;
