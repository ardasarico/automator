import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@automator/ui",
    "@automator/api-client",
    "@automator/contracts",
    "@automator/miniapp",
  ],
};

export default nextConfig;
