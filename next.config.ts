import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["@ammora-protocol/sdk", "@ammora-protocol/math"],
};

export default nextConfig;
