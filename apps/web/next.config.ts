import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@automator/ui", "@automator/api-client", "@automator/contracts"],
  // Bottom-left is where the account menu lives, so the dev indicator moves to the other corner.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
