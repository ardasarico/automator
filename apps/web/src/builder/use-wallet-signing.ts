"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccessToken } from "../auth/access-token";
import { fetchWallet } from "./wallet-client";

export type SigningStatus = "checking" | "enabled" | "disabled" | "unknown";

/**
 * Whether the owner's wallet lets the server sign, as `GET /wallet` reports it. `unknown` covers
 * a server that cannot sign at all (the field is absent) and a wallet that could not be read:
 * neither is a reason to hold the owner back here, since the API refuses on its own when it
 * must. Nothing is fetched while `needed` is false. Re-checks on window focus and on `refresh`.
 */
export function useWalletSigning(
  needed: boolean,
  chainId: number,
): { status: SigningStatus; refresh: () => void } {
  const getAccessToken = useAccessToken();
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((count) => count + 1), []);
  // The answer is keyed by what was asked, so a stale one is never read as current. A wallet
  // already seen as enabled stays so while it is re-checked: the answer can only confirm it or
  // take it away, and a button flickering off in between helps no one.
  const key = `${chainId}:${generation}`;
  const [result, setResult] = useState<{ key: string; status: SigningStatus } | null>(null);

  useEffect(() => {
    if (!needed) return;
    const controller = new AbortController();
    void (async () => {
      let status: SigningStatus = "unknown";
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        const wallet = await fetchWallet(token, chainId, controller.signal);
        if (wallet.signing !== undefined) status = wallet.signing ? "enabled" : "disabled";
      } catch {
        status = "unknown";
      }
      // Same answer, same object: a caller whose access-token getter is recreated per render
      // would otherwise re-run this effect for ever.
      if (!controller.signal.aborted)
        setResult((current) =>
          current?.key === key && current.status === status ? current : { key, status },
        );
    })();
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [needed, chainId, key, getAccessToken, refresh]);

  const status: SigningStatus = !needed
    ? "unknown"
    : result?.key === key
      ? result.status
      : result?.status === "enabled"
        ? "enabled"
        : "checking";

  return { status, refresh };
}

/** "Send USDC needs", "Send USDC and Sign message need", "A, B and C need". */
export function needsSigning(labels: readonly string[]): string {
  if (labels.length === 1) return `${labels[0]} needs`;
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)} need`;
}
