"use client";

import { sessionContract, type AuthUser, type SessionResponse } from "@automator/contracts";
import { PrivyProvider, useCreateWallet, usePrivy, useUser, type User } from "@privy-io/react-auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "@automator/ui/theme-provider";
import { authRequest, AuthRequestError } from "./client";

function setupError(stage: "session" | "wallet" | "account", cause: unknown) {
  const code =
    cause instanceof AuthRequestError
      ? cause.code
      : cause &&
          typeof cause === "object" &&
          "privyErrorCode" in cause &&
          typeof cause.privyErrorCode === "string"
        ? cause.privyErrorCode
        : "unknown";
  // Only diagnostic codes are logged; never log tokens, credentials or user data.
  console.warn(`Auth setup failed ${JSON.stringify({ stage, code })}`);
  if (code === "too_many_requests")
    return new Error("Sign-in requests are temporarily limited. Wait a minute, then try again.");
  const messages = {
    session: "Your sign-in session couldn’t be restored. Try again or log out to start over.",
    wallet: "You’re signed in, but we couldn’t prepare your wallet. Please try again.",
    account: "You’re signed in, but we couldn’t connect your Automator account. Please try again.",
  };
  return new Error(messages[stage]);
}

interface AuthSession {
  user: AuthUser | null;
  pending: boolean;
  error: string | null;
  refresh: () => Promise<AuthUser>;
  logout: () => Promise<void>;
}
const SessionContext = createContext<AuthSession | null>(null);
export function useAuthSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Auth session provider is missing");
  return session;
}
function hasEmbeddedWallet(user: User) {
  return user.linkedAccounts.some(
    (account) =>
      account.type === "wallet" &&
      account.chainType === "ethereum" &&
      account.walletClientType === "privy",
  );
}

function SessionProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user: privyUser, getAccessToken, logout: privyLogout } = usePrivy();
  const { refreshUser } = useUser();
  const { createWallet } = useCreateWallet();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<SessionResponse> | null>(null);
  const loggingOut = useRef(false);
  const lastAttemptAt = useRef(0);
  const userId = privyUser?.id;

  const synchronize = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const task = (async () => {
      if (loggingOut.current) throw new Error("Logging out");
      const current = privyUser;
      if (!current) throw setupError("session", new Error("Not signed in"));
      if (!hasEmbeddedWallet(current)) {
        try {
          await createWallet();
        } catch (cause) {
          // Another tab may have created the first wallet while this request was in flight.
          const latest = await refreshUser().catch(() => null);
          if (!latest || !hasEmbeddedWallet(latest)) throw setupError("wallet", cause);
        }
      }
      const session = await authRequest(sessionContract, await getAccessToken()).catch(
        (cause: unknown) => {
          throw setupError("account", cause);
        },
      );
      if (!session.user.walletAddress) throw setupError("wallet", new Error("Wallet is not ready"));
      return session;
    })();
    inFlight.current = task;
    void task
      .finally(() => {
        if (inFlight.current === task) inFlight.current = null;
      })
      .catch(() => {});
    return task;
  }, [createWallet, getAccessToken, refreshUser, privyUser]);

  const refresh = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const session = await synchronize();
      if (session.user.id !== userId) throw new Error("The signed-in account changed");
      setUser(session.user);
      return session.user;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn’t finish signing you in. Please try again.",
      );
      throw cause;
    } finally {
      setPending(false);
    }
  }, [synchronize, userId]);

  // SDK callbacks may change identity when refreshUser updates the Privy context.
  // Read the latest callback without restarting the session effect on each render.
  const synchronizeInEffect = useEffectEvent(synchronize);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !userId) {
      setUser(null);
      setPending(false);
      return;
    }
    let active = true;
    const sync = async () => {
      if (loggingOut.current) return;
      if (Date.now() - lastAttemptAt.current < 30_000) return;
      lastAttemptAt.current = Date.now();
      try {
        const session = await synchronizeInEffect();
        if (session.user.id !== userId) throw new Error("The signed-in account changed");
        if (active) {
          setUser(session.user);
          setError(null);
          setPending(false);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "We couldn’t refresh your session. Please try again.",
          );
          setPending(false);
        }
      }
    };
    setPending(true);
    setUser(null);
    lastAttemptAt.current = 0;
    void sync();
    const interval = window.setInterval(() => {
      void sync();
    }, 5 * 60_000);
    const onFocus = () => {
      void sync();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [ready, authenticated, userId]);

  const logout = useCallback(async () => {
    loggingOut.current = true;
    setPending(true);
    setError(null);
    try {
      // Let any cookie-writing request finish before clearing the server session.
      await inFlight.current?.catch(() => {});
      await privyLogout();
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not clear session");
      window.location.assign("/login");
    } catch (cause) {
      loggingOut.current = false;
      setError("We couldn’t finish logging you out. Please try again.");
      setPending(false);
      throw cause;
    }
  }, [privyLogout]);

  return (
    <SessionContext value={{ user, pending, error, refresh, logout }}>{children}</SessionContext>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const { resolvedTheme } = useTheme();
  if (!appId)
    return (
      <main className="grid min-h-dvh place-content-center p-6">
        <p>Sign-in is temporarily unavailable. Please try again later.</p>
      </main>
    );
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "wallet"],
        appearance: {
          theme: resolvedTheme === "dark" ? "dark" : "light",
          accentColor: "#00CEFF",
          walletChainType: "ethereum-only",
        },
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
        sessions: { cookieWriteBehavior: "never" },
      }}
    >
      <SessionProvider>{children}</SessionProvider>
    </PrivyProvider>
  );
}
