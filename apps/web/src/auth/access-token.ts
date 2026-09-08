"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback } from "react";

const e2eToken =
  process.env.NODE_ENV === "production"
    ? undefined
    : process.env.NEXT_PUBLIC_E2E_TOKEN || undefined;

export const e2eSession = e2eToken !== undefined;

export function useAccessToken(): () => Promise<string | null> {
  const { getAccessToken } = usePrivy();
  return useCallback(async () => e2eToken ?? (await getAccessToken()), [getAccessToken]);
}
