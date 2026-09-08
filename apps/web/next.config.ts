import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.E2E_NEXT_DIST_DIR ?? ".next",
  transpilePackages: [
    "@automator/ui",
    "@automator/api-client",
    "@automator/contracts",
    "@automator/miniapp",
  ],
  // Bottom-left is where the account menu lives, so the dev indicator moves to the other corner.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
