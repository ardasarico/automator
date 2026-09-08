import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.E2E_NEXT_DIST_DIR ?? ".next",
  transpilePackages: [
    "@automator/ui",
    "@automator/api-client",
    "@automator/contracts",
    "@automator/miniapp",
  ],
};

export default nextConfig;
