"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback } from "react";

/**
 * The bearer token client calls send to the same-origin API handlers. Privy issues it; the
 * end-to-end suite alone runs the web app with `NEXT_PUBLIC_E2E_TOKEN`, which stands in for
 * a Privy session and is ignored outright in production builds.
 */
const e2eToken =
  process.env.NODE_ENV === "production"
    ? undefined
    : process.env.NEXT_PUBLIC_E2E_TOKEN || undefined;

/** True only while the app runs under the end-to-end suite. */
export const e2eSession = e2eToken !== undefined;

export function useAccessToken(): () => Promise<string | null> {
  const { getAccessToken } = usePrivy();
  return useCallback(async () => e2eToken ?? (await getAccessToken()), [getAccessToken]);
}
