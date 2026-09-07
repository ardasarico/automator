"use client";

import type {
  PrivyLoginConfig,
  WorldIdVerifyConfig,
  WorldProof,
  WorldRequest,
} from "@automator/contracts";
import { IdentityActionsProvider, type IdentityActions } from "@automator/miniapp";
import { useTheme } from "@automator/ui/theme-provider";
import { PrivyProvider, useLogin, usePrivy } from "@privy-io/react-auth";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  describeIdKitError,
  describePrivyError,
  privyLoginMethods,
  toIdKitRequest,
  toWorldProof,
} from "./identity";

/** IDKit's widget runs in the browser only: it opens a modal with a QR code, or talks to World App. */
const IDKitRequestWidget = dynamic(
  () => import("@worldcoin/idkit").then((module) => module.IDKitRequestWidget),
  { ssr: false },
);

type PrivyLogin = NonNullable<IdentityActions["privyLogin"]>;

type PendingWorld = {
  idKit: ReturnType<typeof toIdKitRequest>;
  resolve(answer: { worldProof: WorldProof }): void;
  reject(error: Error): void;
};

/**
 * Provides the identity actions a published mini-app's screens call: a Privy login backed by
 * the runtime's Privy app, and a World ID verification through IDKit with the request context
 * the API signed for the screen. Installs MiniKit when the page runs inside World App, where
 * IDKit completes without a QR code.
 */
function IdentityBridge({ privyLogin, children }: { privyLogin: PrivyLogin; children: ReactNode }) {
  const [inWorldApp, setInWorldApp] = useState(false);
  const [pending, setPending] = useState<PendingWorld | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    let active = true;
    // MiniKit is loaded lazily: outside World App it only reports that it is not installed.
    import("@worldcoin/minikit-js")
      .then(({ MiniKit }) => {
        if (!active) return;
        try {
          MiniKit.install();
          setInWorldApp(MiniKit.isInstalled());
        } catch {
          setInWorldApp(false);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const worldVerify = useCallback((config: WorldIdVerifyConfig, request: WorldRequest) => {
    let idKit: ReturnType<typeof toIdKitRequest>;
    try {
      idKit = toIdKitRequest(config, request);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return new Promise<{ worldProof: WorldProof }>((resolve, reject) => {
      settled.current = false;
      setPending({ idKit, resolve, reject });
    });
  }, []);

  const actions = useMemo<IdentityActions>(
    () => ({ privyLogin, worldVerify, inWorldApp }),
    [privyLogin, worldVerify, inWorldApp],
  );

  const finish = (outcome: { proof: WorldProof } | { error: Error }) => {
    if (!pending || settled.current) return;
    settled.current = true;
    if ("proof" in outcome) pending.resolve({ worldProof: outcome.proof });
    else pending.reject(outcome.error);
    setPending(null);
  };

  return (
    <IdentityActionsProvider actions={actions}>
      {children}
      {pending && (
        <IDKitRequestWidget
          {...pending.idKit}
          open
          onOpenChange={(open) => {
            if (!open) finish({ error: new Error(describeIdKitError("user_rejected")) });
          }}
          onSuccess={(result) => {
            try {
              finish({ proof: toWorldProof(result) });
            } catch (error) {
              finish({ error: error instanceof Error ? error : new Error(String(error)) });
            }
          }}
          onError={(code) => finish({ error: new Error(describeIdKitError(String(code))) })}
        />
      )}
    </IdentityActionsProvider>
  );
}

/** Inside the Privy provider: signs the visitor in with the screen's methods and yields their token. */
function WithPrivy({ children }: { children: ReactNode }) {
  const { getAccessToken } = usePrivy();
  const pending = useRef<{ resolve(token: string): void; reject(error: Error): void } | null>(null);
  const { login } = useLogin({
    onComplete: () => {
      const waiting = pending.current;
      pending.current = null;
      if (!waiting) return;
      getAccessToken().then(
        (token) => {
          if (token) waiting.resolve(token);
          else waiting.reject(new Error(describePrivyError("no_token")));
        },
        () => waiting.reject(new Error(describePrivyError("no_token"))),
      );
    },
    onError: (code) => {
      const waiting = pending.current;
      pending.current = null;
      waiting?.reject(new Error(describePrivyError(String(code))));
    },
  });
  const privyLogin = useCallback<PrivyLogin>(
    (config: PrivyLoginConfig) =>
      new Promise<{ privyToken: string }>((resolve, reject) => {
        pending.current?.reject(new Error(describePrivyError("exited_auth_flow")));
        pending.current = { resolve: (privyToken) => resolve({ privyToken }), reject };
        const loginMethods = privyLoginMethods(config);
        login(loginMethods ? { loginMethods } : {});
      }),
    [login],
  );
  return <IdentityBridge privyLogin={privyLogin}>{children}</IdentityBridge>;
}

const noPrivy: PrivyLogin = () =>
  Promise.reject(new Error("Sign-in is not available on this app yet."));

/**
 * Wraps a published mini-app with the providers its identity screens need. Without a Privy
 * app id the login screen says sign-in is unavailable rather than falling back to a sample.
 */
export function IdentityHost({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const { resolvedTheme } = useTheme();
  if (!appId) return <IdentityBridge privyLogin={noPrivy}>{children}</IdentityBridge>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: resolvedTheme === "dark" ? "dark" : "light",
          accentColor: "#00CEFF",
          walletChainType: "ethereum-only",
        },
        // Visitors get an embedded wallet on first sign-in, so the flow's `wallet` is set.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        sessions: { cookieWriteBehavior: "never" },
      }}
    >
      <WithPrivy>{children}</WithPrivy>
    </PrivyProvider>
  );
}
