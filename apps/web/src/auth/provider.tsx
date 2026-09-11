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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "@automator/ui/theme-provider";
import { authRequest, AuthRequestError } from "./client";
import { e2eSession, useAccessToken } from "./access-token";
import { secretsStore } from "../builder/secrets-store";

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
function sameUser(current: AuthUser | null, next: AuthUser) {
  return (
    current !== null &&
    current.id === next.id &&
    current.name === next.name &&
    current.username === next.username &&
    current.walletAddress === next.walletAddress
  );
}
const signedOutPaths = ["/login", "/onboarding"];
function needsSession(pathname: string) {
  return !signedOutPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function SessionProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: AuthUser;
}) {
  const { ready, authenticated, user: privyUser, logout: privyLogout } = usePrivy();
  // The SDK's token, or the fixed e2e token when the Playwright suite runs the browser.
  const getAccessToken = useAccessToken();
  const { refreshUser } = useUser();
  const { createWallet } = useCreateWallet();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(initialUser ?? null);
  const [pending, setPending] = useState(!initialUser);
  const [error, setError] = useState<string | null>(null);
  const loggingOut = useRef(false);
  const lastAttemptAt = useRef(0);
  const userId = privyUser?.id;
  const secretsAccountId =
    (e2eSession || !ready ? initialUser?.id : authenticated ? userId : null) ?? null;
  useLayoutEffect(() => {
    secretsStore.getState().setAccount(secretsAccountId);
  }, [secretsAccountId]);
  /*
   * Who the requests below must belong to. The Playwright suite has no SDK session: there the
   * server-rendered user is the identity, so the profile can be saved with the e2e token.
   */
  const initialUserId = initialUser?.id;
  const identity = useMemo(
    () => ({
      userId: e2eSession ? initialUserId : ready && authenticated ? userId : undefined,
    }),
    [ready, authenticated, userId, initialUserId],
  );
  const currentIdentity = useRef(identity);
  const inFlight = useRef<{
    identity: typeof identity;
    task: Promise<SessionResponse>;
  } | null>(null);
  const clearingCookie = useRef<Promise<Response> | null>(null);
  useEffect(() => {
    currentIdentity.current = identity;
  }, [identity]);

  const assertCurrentIdentity = useCallback(() => {
    if (loggingOut.current) throw new Error("Logging out");
    if (currentIdentity.current !== identity || !identity.userId)
      throw new Error("The signed-in account changed");
  }, [identity]);

  const store = useCallback((next: AuthUser) => {
    setUser((current) => (sameUser(current, next) ? current : next));
  }, []);

  const clearSessionCookie = useCallback(() => {
    if (clearingCookie.current) return clearingCookie.current;
    const task = fetch("/api/auth/session", {
      method: "DELETE",
      signal: AbortSignal.timeout(20_000),
    });
    clearingCookie.current = task;
    void task
      .finally(() => {
        if (clearingCookie.current === task) clearingCookie.current = null;
      })
      .catch(() => {});
    return task;
  }, []);

  const synchronize = useCallback(() => {
    if (loggingOut.current) return Promise.reject(new Error("Logging out"));
    if (inFlight.current?.identity === identity) return inFlight.current.task;
    const previous = inFlight.current?.task;
    const deletion = clearingCookie.current;
    const task = (async () => {
      // A previous account's response can still write the cookie. Finish it before
      // synchronizing the new account so the final cookie always matches the SDK.
      if (previous) await previous.catch(() => {});
      if (deletion) await deletion.catch(() => {});
      assertCurrentIdentity();
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
      assertCurrentIdentity();
      const token = await getAccessToken();
      assertCurrentIdentity();
      const session = await authRequest(sessionContract, token).catch((cause: unknown) => {
        throw setupError("account", cause);
      });
      assertCurrentIdentity();
      if (session.user.id !== identity.userId) throw new Error("The signed-in account changed");
      if (!session.user.walletAddress) throw setupError("wallet", new Error("Wallet is not ready"));
      return session;
    })();
    inFlight.current = { identity, task };
    void task
      .finally(() => {
        if (inFlight.current?.task === task) inFlight.current = null;
      })
      .catch(() => {});
    return task;
  }, [assertCurrentIdentity, createWallet, getAccessToken, identity, refreshUser, privyUser]);

  const refresh = useCallback(async () => {
    assertCurrentIdentity();
    setPending(true);
    setError(null);
    try {
      const session = await synchronize();
      assertCurrentIdentity();
      store(session.user);
      return session.user;
    } catch (cause) {
      if (currentIdentity.current === identity && !loggingOut.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "We couldn’t finish signing you in. Please try again.",
        );
      throw cause;
    } finally {
      if (currentIdentity.current === identity && !loggingOut.current) setPending(false);
    }
  }, [assertCurrentIdentity, identity, store, synchronize]);

  const saveProfile = useCallback(
    async (input: ProfileInput) => {
      assertCurrentIdentity();
      const token = await getAccessToken();
      assertCurrentIdentity();
      const saved = await authRequest(profileContract, token, input);
      assertCurrentIdentity();
      if (saved.user.id !== identity.userId) throw new Error("The signed-in account changed");
      store(saved.user);
      return saved.user;
    },
    [assertCurrentIdentity, getAccessToken, identity, store],
  );

  // SDK callbacks may change identity when refreshUser updates the Privy context.
  // Read the latest callback without restarting the session effect on each render.
  const synchronizeInEffect = useEffectEvent(synchronize);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !userId) {
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
        if (active && !loggingOut.current) {
          store(session.user);
          setError(null);
          setPending(false);
        }
      } catch (cause) {
        if (active && !loggingOut.current) {
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
      await inFlight.current?.task.catch(() => {});
      // Clear the mirrored cookie first: if it survives, the SDK session has to
      // survive with it, or the next page load would render as a signed-in user.
      const response = await clearSessionCookie();
      if (!response.ok) throw new Error("Could not clear session");
      await privyLogout();
      secretsStore.getState().setAccount(null);
      window.location.assign("/login");
    } catch (cause) {
      loggingOut.current = false;
      setError("We couldn’t finish logging you out. Please try again.");
      setPending(false);
      throw cause;
    }
  }, [clearSessionCookie, privyLogout]);

  const signedOut = ready && !authenticated && !e2eSession;
  const signOutHandled = useRef(false);
  useEffect(() => {
    if (!signedOut) {
      signOutHandled.current = false;
      return;
    }
    if (loggingOut.current || signOutHandled.current || !needsSession(pathname)) return;
    signOutHandled.current = true;
    void (async () => {
      await inFlight.current?.task.catch(() => {});
      if (currentIdentity.current !== identity) return;
      await clearSessionCookie().catch(() => {});
      if (currentIdentity.current === identity) router.replace("/login");
    })();
  }, [clearSessionCookie, identity, signedOut, pathname, router]);

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
