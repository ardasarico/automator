"use client";

import { Button } from "@automator/ui/button";
import { usePrivy, useSigners } from "@privy-io/react-auth";
import { RiShieldKeyholeLine } from "@remixicon/react";
import { useState } from "react";

const signerId = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;

/**
 * Lets the user grant the API's signer on their embedded wallet once, so runs can send
 * transactions with no one in the browser (Simulate in live mode, webhook and schedule
 * triggers). Renders nothing when the app has no signer id configured or the wallet already
 * carries the signer. Revoking is done from the Privy-side wallet settings.
 */
export function EnableSigningButton() {
  const { user } = usePrivy();
  const { addSigners } = useSigners();
  const [state, setState] = useState<"idle" | "pending" | "done" | "failed">("idle");
  const wallet = user?.linkedAccounts.find(
    (account) =>
      account.type === "wallet" &&
      account.chainType === "ethereum" &&
      account.walletClientType === "privy",
  );
  if (!signerId || !wallet || !("address" in wallet)) return null;
  const delegated = "delegated" in wallet && wallet.delegated === true;
  if (delegated || state === "done") {
    return (
      <p role="status" className="text-caption text-muted-foreground">
        Server signing is enabled for this wallet.
      </p>
    );
  }

  async function enable() {
    if (!wallet || !("address" in wallet)) return;
    setState("pending");
    try {
      await addSigners({
        address: wallet.address,
        signers: [{ signerId: signerId!, policyIds: [] }],
      });
      setState("done");
    } catch {
      setState("failed");
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
      {state === "failed" && (
        <p role="alert" className="text-caption text-destructive-text">
          Signing could not be enabled. Try again.
        </p>
      )}
    </div>
  );
}
