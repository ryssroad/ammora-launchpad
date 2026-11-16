import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ammora-protocol/sdk", "@ammora-protocol/math"],
};

export default nextConfig;
