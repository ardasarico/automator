"use client";

import { defaultChainId } from "@automator/contracts";
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { usePrivy, useSigners } from "@privy-io/react-auth";
import { RiShieldCheckLine, RiShieldKeyholeLine } from "@remixicon/react";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { useWalletSigning } from "../../../builder/use-wallet-signing";
import styles from "./wallet.module.css";

const signerId = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;

type Request = "idle" | "pending" | "done" | "failed";
type Signing = {
  enabled: boolean;
  /** The page can offer to enable: a signer is configured and Privy knows the embedded wallet. */
  canEnable: boolean;
  request: Request;
  enable: () => void;
};

const SigningContext = createContext<Signing | null>(null);

/**
 * One signing state for the whole page, so the title bar's action and the identity band's
 * sentence never disagree. The server's answer seeds it; the API is re-asked on focus and
 * after a grant, and Privy's `addSigners` is the act itself.
 */
export function WalletSigningProvider({
  initial,
  children,
}: {
  initial: boolean | undefined;
  children: ReactNode;
}) {
  const { user } = usePrivy();
  const { addSigners } = useSigners();
  const { status, refresh } = useWalletSigning(true, defaultChainId);
  const [request, setRequest] = useState<Request>("idle");
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const wallet = user?.linkedAccounts.find(
    (account) =>
      account.type === "wallet" &&
      account.chainType === "ethereum" &&
      account.walletClientType === "privy",
  );
  const address = wallet && "address" in wallet ? wallet.address : undefined;
  const enabled =
    status === "enabled" || status === "disabled" ? status === "enabled" : initial === true;

  async function enable() {
    if (pending.current || !address || !signerId) return;
    pending.current = true;
    setRequest("pending");
    try {
      await addSigners({ address, signers: [{ signerId, policyIds: [] }] });
      if (mounted.current) setRequest("done");
      refresh();
    } catch {
      if (mounted.current) setRequest("failed");
    } finally {
      pending.current = false;
    }
  }

  return (
    <SigningContext.Provider
      value={{
        enabled,
        canEnable: Boolean(signerId && address),
        request,
        enable: () => void enable(),
      }}
    >
      {children}
    </SigningContext.Provider>
  );
}

function useSigning(): Signing {
  const signing = useContext(SigningContext);
  if (!signing) throw new Error("WalletSigningProvider is missing");
  return signing;
}

/** The title bar's one act: enable server signing, or the badge that says it is. */
export function SigningAction() {
  const { enabled, canEnable, request, enable } = useSigning();
  if (enabled)
    return (
      <Badge variant="success">
        <RiShieldCheckLine aria-hidden="true" />
        Server signing enabled
      </Badge>
    );
  if (!canEnable) return null;
  return (
    <Button size="sm" loading={request === "pending"} onClick={enable}>
      <RiShieldKeyholeLine aria-hidden="true" />
      Enable server signing
    </Button>
  );
}

/** What the signing state means for this wallet, under its address. */
export function SigningLine() {
  const { enabled, request } = useSigning();
  if (enabled)
    return (
      <p className={styles.line}>
        Server signing is on: live runs sign transactions with this wallet while you are away.
      </p>
    );
  return (
    <>
      <p className={styles.line}>
        Server signing is off: live runs cannot send from this wallet while you are away.
      </p>
      {request === "done" && (
        <p className={styles.line} role="status">
          Permission submitted. The API will verify its configured signer before running.
        </p>
      )}
      {request === "failed" && (
        <p className={`${styles.line} ${styles.alert}`} role="alert">
          Signing could not be enabled. Try again.
        </p>
      )}
    </>
  );
}
