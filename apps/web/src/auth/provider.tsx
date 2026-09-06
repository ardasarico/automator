"use client";

import {
  profileContract,
  sessionContract,
  type AuthUser,
  type ProfileInput,
  type SessionResponse,
} from "@automator/contracts";
import { PrivyProvider, useCreateWallet, usePrivy, useUser, type User } from "@privy-io/react-auth";
import { usePathname, useRouter } from "next/navigation";
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
  saveProfile: (input: ProfileInput) => Promise<AuthUser>;
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
/** Every field the UI renders, so an unchanged synchronization keeps the same object. */
function sameUser(current: AuthUser | null, next: AuthUser) {
  return (
    current !== null &&
    current.id === next.id &&
    current.name === next.name &&
    current.username === next.username &&
    current.walletAddress === next.walletAddress
  );
}
/** Routes that render for signed-out visitors; every other path needs a session. */
const signedOutPaths = ["/login", "/onboarding"];
function needsSession(pathname: string) {
  return !signedOutPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Holds the Automator session for one route group. `initialUser` is the
 * server-verified user from the layout, so a hard load renders the account
 * straight away and the background synchronization only corrects it.
 */
export function SessionProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: AuthUser;
}) {
  const { ready, authenticated, user: privyUser, getAccessToken, logout: privyLogout } = usePrivy();
  const { refreshUser } = useUser();
  const { createWallet } = useCreateWallet();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(initialUser ?? null);
  const [pending, setPending] = useState(!initialUser);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<SessionResponse> | null>(null);
  const loggingOut = useRef(false);
  const lastAttemptAt = useRef(0);
  const userId = privyUser?.id;

  const store = useCallback((next: AuthUser) => {
    setUser((current) => (sameUser(current, next) ? current : next));
  }, []);

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
      store(session.user);
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
  }, [store, synchronize, userId]);

  const saveProfile = useCallback(
    async (input: ProfileInput) => {
      const saved = await authRequest(profileContract, await getAccessToken(), input);
      store(saved.user);
      return saved.user;
    },
    [getAccessToken, store],
  );

  // SDK callbacks may change identity when refreshUser updates the Privy context.
  // Read the latest callback without restarting the session effect on each render.
  const synchronizeInEffect = useEffectEvent(synchronize);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !userId) {
      // Privy finished loading and reports the visitor as authenticated, but the user
      // record has no id yet: there is nothing to synchronize, so stop waiting.
      if (authenticated) {
        void (async () => {
          setPending(false);
        })();
      }
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
          store(session.user);
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
  }, [ready, authenticated, userId, store]);

  const logout = useCallback(async () => {
    loggingOut.current = true;
    setPending(true);
    setError(null);
    try {
      // Let any cookie-writing request finish before clearing the server session.
      await inFlight.current?.catch(() => {});
      // Clear the mirrored cookie first: if it survives, the SDK session has to
      // survive with it, or the next page load would render as a signed-in user.
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not clear session");
      await privyLogout();
      window.location.assign("/login");
    } catch (cause) {
      loggingOut.current = false;
      setError("We couldn’t finish logging you out. Please try again.");
      setPending(false);
      throw cause;
    }
  }, [privyLogout]);

  // Privy is the source of truth: once it reports a signed-out visitor, the
  // mirrored cookie is stale and private routes must send them to sign in.
  const signedOut = ready && !authenticated;
  const signOutHandled = useRef(false);
  useEffect(() => {
    if (!signedOut) {
      signOutHandled.current = false;
      return;
    }
    if (loggingOut.current || signOutHandled.current || !needsSession(pathname)) return;
    signOutHandled.current = true;
    void fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    router.replace("/login");
  }, [signedOut, pathname, router]);

  // A session loaded for another Privy user is stale until the next sync lands.
  const stale = user !== null && userId !== undefined && user.id !== userId;
  return (
    <SessionContext
      value={{
        user: signedOut || stale ? null : user,
        pending: signedOut ? false : stale || pending,
        error,
        refresh,
        saveProfile,
        logout,
      }}
    >
      {children}
    </SessionContext>
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
      {children}
    </PrivyProvider>
  );
}
