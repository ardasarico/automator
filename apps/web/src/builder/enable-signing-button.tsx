"use client";

import { defaultChainId } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { usePrivy, useSigners } from "@privy-io/react-auth";
import { RiShieldKeyholeLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { fetchWallet } from "./wallet-client";

const signerId = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;

export function EnableSigningButton() {
  const { user } = usePrivy();
  const wallet = user?.linkedAccounts.find(
    (account) =>
      account.type === "wallet" &&
      account.chainType === "ethereum" &&
      account.walletClientType === "privy",
  );
  if (!signerId || !wallet || !("address" in wallet)) return null;
  const delegated = "delegated" in wallet && wallet.delegated === true;
  return (
    <WalletSigningButton
      key={`${user?.id}:${wallet.address}:${delegated}`}
      address={wallet.address}
      signerId={signerId}
      delegated={delegated}
    />
  );
}

function WalletSigningButton({
  address,
  signerId,
  delegated,
}: {
  address: string;
  signerId: string;
  delegated: boolean;
}) {
  const { addSigners } = useSigners();
  const { getAccessToken } = usePrivy();
  const [verified, setVerified] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "done" | "failed">("idle");
  const mounted = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const controller = new AbortController();
    const check = async () => {
      const request = ++generation;
      try {
        const token = await getAccessToken();
        if (!active) return;
        const current = await fetchWallet(token, defaultChainId, controller.signal);
        if (active && request === generation)
          setVerified(
            current.address.toLowerCase() === address.toLowerCase() && current.signing === true,
          );
      } catch {
        if (active && request === generation) setVerified(false);
      }
    };
    void check();
    window.addEventListener("focus", check);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("focus", check);
    };
  }, [address, delegated, getAccessToken, state]);
  if (verified) {
    return (
      <p role="status" className="text-caption text-muted-foreground">
        Server signing is enabled for this wallet.
      </p>
    );
  }

  async function enable() {
    if (pending.current) return;
    pending.current = true;
    setState("pending");
    try {
      await addSigners({
        address,
        signers: [{ signerId, policyIds: [] }],
      });
      if (mounted.current) setState("done");
    } catch {
      if (mounted.current) setState("failed");
    } finally {
      pending.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="outline" size="sm" loading={state === "pending"} onClick={enable}>
        <RiShieldKeyholeLine aria-hidden="true" />
        Enable server signing
      </Button>
      <p className="text-caption text-muted-foreground">
        Lets flows send transactions from your wallet while you are away.
      </p>
      {state === "done" && !verified && (
        <p role="status" className="text-caption text-muted-foreground">
          Permission submitted. The API will verify its configured signer before running.
        </p>
      )}
      {state === "failed" && (
        <p role="alert" className="text-caption text-destructive-text">
          Signing could not be enabled. Try again.
        </p>
      )}
    </div>
  );
}
