"use client";

import { chainName, type Wallet } from "@automator/contracts";
import { useEffect, useRef, useState } from "react";
import { useAccessToken } from "../auth/access-token";
import { fetchWallet, WalletRequestError } from "./wallet-client";

const failures: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page to see balances.",
  not_found: "This account has no embedded wallet yet.",
  unavailable: "Balances are unavailable right now.",
};

/** True when the wallet holds nothing the flow could spend on that chain. */
export function hasNoFunds(wallet: Wallet): boolean {
  return Number(wallet.nativeBalance) === 0 && Number(wallet.usdcBalance ?? "0") === 0;
}

/** The warning the settings dialog and the run panel share. */
export function noFundsMessage(chainId: number): string {
  return `This wallet has no funds on ${chainName(chainId)}.`;
}

/**
 * The embedded wallet's balances on one chain, fetched when the chain changes and cached for
 * as long as the component is mounted (one dialog open). Says plainly when the wallet holds
 * nothing on that chain, without pointing at faucets.
 */
export function WalletFunds({ chainId }: { chainId: number }) {
  const getAccessToken = useAccessToken();
  const cache = useRef(new Map<number, Wallet>());
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = cache.current.get(chainId);
    if (cached) {
      setWallet(cached);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setWallet(null);
    setError(null);
    setLoading(true);
    void (async () => {
      try {
        const fetched = await fetchWallet(await getAccessToken(), chainId, controller.signal);
        cache.current.set(chainId, fetched);
        if (!controller.signal.aborted) setWallet(fetched);
      } catch (caught) {
        if (controller.signal.aborted) return;
        const code = caught instanceof WalletRequestError ? caught.code : "unavailable";
        setError(failures[code] ?? failures.unavailable!);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [chainId, getAccessToken]);

  if (error)
    return (
      <p className="text-caption text-muted-foreground" role="status">
        {error}
      </p>
    );
  if (!wallet)
    return (
      <p className="text-caption text-muted-foreground" role="status" aria-busy={loading}>
        {loading ? `Checking the wallet on ${chainName(chainId)}…` : ""}
      </p>
    );
  const balances = [`${wallet.nativeBalance} ${wallet.nativeSymbol}`];
  if (wallet.usdcBalance !== undefined) balances.push(`${wallet.usdcBalance} USDC`);
  return (
    <div className="flex flex-col gap-1" role="status">
      <p className="text-caption text-muted-foreground">
        <span className="font-mono">{shorten(wallet.address)}</span> on {wallet.chainName}:{" "}
        {balances.join(" · ")}
      </p>
      {hasNoFunds(wallet) && (
        <p className="text-caption text-warning-foreground">{noFundsMessage(chainId)}</p>
      )}
    </div>
  );
}

function shorten(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
