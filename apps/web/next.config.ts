import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.E2E_NEXT_DIST_DIR ?? ".next",
  transpilePackages: [
    "@automator/ui",
    "@automator/api-client",
    "@automator/contracts",
    "@automator/miniapp",
  ],
  devIndicators: { position: "bottom-right" },
  /*
   * The landing page hands its prompt over as `/?prompt=`. The workspace layout sends a visitor
   * without a session to `/login` from the server, where the query would be lost, so the
   * redirect is made here instead, keeping the prompt for the login page to hold on to. The
   * cookie only mirrors the session; a stale one still lands on `/login` without the prompt.
   */
  redirects: async () => [
    {
      source: "/",
      has: [{ type: "query", key: "prompt" }],
      missing: [{ type: "cookie", key: "automator-session" }],
      destination: "/login?prompt=:prompt",
      permanent: false,
    },
    /*
     * Any other page opened without a session goes to `/login` carrying the path, so sign-in can
     * return to the deep link instead of Flows. Route handlers, the health check, Next's own
     * assets and files with an extension are not pages and pass through; the query string is
     * not carried, so `/flows/<id>?run=<id>` returns to the flow without its run.
     */
    {
      source: "/:path((?!login$|onboarding$|api/|_next/|health$|.*\\.[^/]*$).+)",
      missing: [{ type: "cookie", key: "automator-session" }],
      destination: "/login?next=/:path",
      permanent: false,
    },
  ],
};

export default nextConfig;
