"use client";

import { chainName, type Wallet } from "@automator/contracts";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { useAccessToken } from "../auth/access-token";
import { fetchWallet, WalletRequestError } from "./wallet-client";
import { hasNoFunds, noFundsMessage } from "./wallet-funds-check";

const failures: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page to see balances.",
  not_found: "This account has no embedded wallet yet.",
  unavailable: "Balances are unavailable right now.",
};

export function WalletFunds({ chainId }: { chainId: number }) {
  const { user } = usePrivy();
  const embeddedWallet = user?.linkedAccounts.find(
    (account) =>
      account.type === "wallet" &&
      account.chainType === "ethereum" &&
      account.walletClientType === "privy",
  );
  const address = embeddedWallet && "address" in embeddedWallet ? embeddedWallet.address : "";
  return <WalletFundsForAccount key={`${user?.id}:${address}`} chainId={chainId} />;
}

function WalletFundsForAccount({ chainId }: { chainId: number }) {
  const getAccessToken = useAccessToken();
  const cache = useRef(new Map<number, Wallet>());
  const [result, setResult] = useState<{
    chainId: number;
    wallet: Wallet | null;
    error: string | null;
    loading: boolean;
  }>({ chainId, wallet: null, error: null, loading: true });

  useEffect(() => {
    const cached = cache.current.get(chainId);
    if (cached) {
      setResult({ chainId, wallet: cached, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setResult({ chainId, wallet: null, error: null, loading: true });
    void (async () => {
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        const fetched = await fetchWallet(token, chainId, controller.signal);
        if (controller.signal.aborted) return;
        cache.current.set(chainId, fetched);
        setResult({ chainId, wallet: fetched, error: null, loading: false });
      } catch (caught) {
        if (controller.signal.aborted) return;
        const code = caught instanceof WalletRequestError ? caught.code : "unavailable";
        setResult({
          chainId,
          wallet: null,
          error: failures[code] ?? failures.unavailable!,
          loading: false,
        });
      }
    })();
    return () => controller.abort();
  }, [chainId, getAccessToken]);

  const { wallet, error, loading } =
    result.chainId === chainId ? result : { wallet: null, error: null, loading: true };
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
