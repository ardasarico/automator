"use client";

import type {
  MiniAppPayment,
  PrivyLoginConfig,
  WorldIdVerifyConfig,
  WorldProof,
  WorldRequest,
  WorldSelfieCheckConfig,
} from "@automator/contracts";
import {
  IdentityActionsProvider,
  type IdentityActions,
  type PaymentActions,
} from "@automator/miniapp";
import { useTheme } from "@automator/ui/theme-provider";
import { PrivyProvider, useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  describeIdKitError,
  describePrivyError,
  isIdKitBackdropClick,
  isIdKitEscape,
  privyLoginMethods,
  selfieCheckAsk,
  toIdKitRequest,
  toWorldProof,
  worldAsk,
  type WorldAsk,
} from "./identity";
import {
  defaultPaymentChain,
  describePaymentError,
  payingWallet,
  paymentChain,
  paymentChains,
  readUsdcBalance,
  transferRequest,
} from "./payment";

const IDKitRequestWidget = dynamic(
  () => import("@worldcoin/idkit").then((module) => module.IDKitRequestWidget),
  { ssr: false },
);

type PrivyLogin = NonNullable<IdentityActions["privyLogin"]>;
type SignIn = (
  loginMethods?: ReturnType<typeof privyLoginMethods>,
) => Promise<{ privyToken: string }>;

type PendingWorld = {
  idKit: ReturnType<typeof toIdKitRequest>;
  resolve(answer: { worldProof: WorldProof }): void;
  reject(error: Error): void;
};

function IdentityBridge({
  privyLogin,
  usdcPayment,
  children,
}: {
  privyLogin: PrivyLogin;
  usdcPayment?: PaymentActions;
  children: ReactNode;
}) {
  const [inWorldApp, setInWorldApp] = useState(false);
  const [pending, setPending] = useState<PendingWorld | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    let active = true;
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

  const ask = useCallback((what: WorldAsk, request: WorldRequest) => {
    let idKit: ReturnType<typeof toIdKitRequest>;
    try {
      idKit = toIdKitRequest(what, request);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return new Promise<{ worldProof: WorldProof }>((resolve, reject) => {
      settled.current = false;
      setPending({ idKit, resolve, reject });
    });
  }, []);
  const worldVerify = useCallback(
    (config: WorldIdVerifyConfig, request: WorldRequest) => ask(worldAsk(config), request),
    [ask],
  );
  const worldSelfieCheck = useCallback(
    (config: WorldSelfieCheckConfig, request: WorldRequest) => ask(selfieCheckAsk(config), request),
    [ask],
  );

  const actions = useMemo<IdentityActions>(
    () => ({
      privyLogin,
      worldVerify,
      worldSelfieCheck,
      inWorldApp,
      ...(usdcPayment ? { usdcPayment } : {}),
    }),
    [privyLogin, worldVerify, worldSelfieCheck, inWorldApp, usdcPayment],
  );

  const finish = (outcome: { proof: WorldProof } | { error: Error }) => {
    if (!pending || settled.current) return;
    settled.current = true;
    if ("proof" in outcome) pending.resolve({ worldProof: outcome.proof });
    else pending.reject(outcome.error);
    setPending(null);
  };

  // A backdrop click or Escape while the visitor is busy on their phone would close the request
  // and drop the proof; only the modal's close button may dismiss an open request.
  useEffect(() => {
    if (!pending || typeof document === "undefined") return;
    const swallowClick = (event: MouseEvent) => {
      if (isIdKitBackdropClick(event.target)) event.stopPropagation();
    };
    const swallowEscape = (event: KeyboardEvent) => {
      if (isIdKitEscape(event.key)) event.stopPropagation();
    };
    document.addEventListener("click", swallowClick, true);
    window.addEventListener("keydown", swallowEscape, true);
    return () => {
      document.removeEventListener("click", swallowClick, true);
      window.removeEventListener("keydown", swallowEscape, true);
    };
  }, [pending]);

  return (
    <IdentityActionsProvider actions={actions}>
      {children}
      {pending && (
        <IDKitRequestWidget
          {...pending.idKit}
          open
          onOpenChange={(open) => {
            if (!open) finish({ error: new Error(describeIdKitError("dismissed")) });
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

function WithPrivy({ children }: { children: ReactNode }) {
  const { authenticated, user, getAccessToken } = usePrivy();
  const pending = useRef<{
    resolve(answer: { privyToken: string }): void;
    reject(error: Error): void;
  } | null>(null);
  const getLoginAnswer = useCallback(async () => {
    const token = await getAccessToken().catch(() => null);
    if (!token) throw new Error(describePrivyError("no_token"));
    return { privyToken: token };
  }, [getAccessToken]);
  const { login } = useLogin({
    onComplete: () => {
      const waiting = pending.current;
      pending.current = null;
      if (!waiting) return;
      void getLoginAnswer().then(waiting.resolve, waiting.reject);
    },
    onError: (code) => {
      const waiting = pending.current;
      pending.current = null;
      waiting?.reject(new Error(describePrivyError(String(code))));
    },
  });
  const signIn = useCallback<SignIn>(
    (loginMethods) => {
      // Privy's login() is a no-op for a signed-in visitor and emits no callback.
      if (authenticated && user && !user.isGuest) return getLoginAnswer();
      return new Promise<{ privyToken: string }>((resolve, reject) => {
        pending.current?.reject(new Error(describePrivyError("exited_auth_flow")));
        pending.current = { resolve, reject };
        login(loginMethods ? { loginMethods } : {});
      });
    },
    [authenticated, getLoginAnswer, login, user],
  );
  const privyLogin = useCallback<PrivyLogin>(
    (config: PrivyLoginConfig) => signIn(privyLoginMethods(config)),
    [signIn],
  );

  const { wallets } = useWallets();
  const usdcPayment = useMemo<PaymentActions>(
    () => ({
      async wallet(payment: MiniAppPayment) {
        // Never prompts: a visitor who has not signed in simply has no wallet to show yet.
        const found = authenticated ? payingWallet(wallets) : null;
        if (!found) return null;
        const balance = await readUsdcBalance(payment, found.address).catch(() => "0");
        return { address: found.address, balance };
      },
      async pay(payment: MiniAppPayment) {
        const { privyToken } = await signIn();
        const found = payingWallet(wallets);
        if (!found) throw new Error("This sign-in has no wallet to pay from.");
        try {
          // The payment is verified on the chain the screen names, so the wallet has to be there.
          await found.switchChain(paymentChain(payment).id);
          const provider = await found.getEthereumProvider();
          const hash = await provider.request({
            method: "eth_sendTransaction",
            params: [transferRequest(payment, found.address)],
          });
          if (typeof hash !== "string") throw new Error("The wallet did not answer with a hash.");
          return { txHash: hash, privyToken };
        } catch (cause) {
          throw new Error(describePaymentError(cause));
        }
      },
    }),
    [authenticated, signIn, wallets],
  );

  return (
    <IdentityBridge privyLogin={privyLogin} usdcPayment={usdcPayment}>
      {children}
    </IdentityBridge>
  );
}

const noPrivy: PrivyLogin = () =>
  Promise.reject(new Error("Sign-in is not available on this app yet."));

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
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        sessions: { cookieWriteBehavior: "never" },
        // A visitor can only be asked to switch to a chain the provider knows about, and a
        // `usdc.payment` screen may name any chain in the registry.
        defaultChain: defaultPaymentChain,
        supportedChains: paymentChains,
      }}
    >
      <WithPrivy>{children}</WithPrivy>
    </PrivyProvider>
  );
}
