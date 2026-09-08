/// <reference types="bun" />
import type { AuthUser, SessionResponse } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { act, StrictMode, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { secretsStore } from "../builder/secrets-store";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let refreshCalls = 0;
let walletCalls = 0;
let sessionCalls = 0;
let logoutCalls = 0;
let hasWallet = false;
let ready = true;
let authenticated = true;
let sdkUserId = "did:privy:test";
let profileCalls = 0;
let sessionAnswer: () => Promise<SessionResponse>;
let profileAnswer: () => Promise<{ user: AuthUser }>;
let tokenAnswer: () => Promise<string | null>;
const events: string[] = [];
const { navigation, navigationModule } = await import("./test-navigation");
const replaced = navigation.replaced;
const fetched: Array<{ url: string; method?: string }> = [];
let deleteOk = true;
let deleteAnswer: (() => Promise<Response>) | undefined;

const linkedWallet = {
  type: "wallet",
  chainType: "ethereum",
  walletClientType: "privy",
  address: "0x1234567890123456789012345678901234567890",
};
const privyUser = () => ({ id: sdkUserId, linkedAccounts: hasWallet ? [linkedWallet] : [] });
const savedUser: AuthUser = {
  id: "did:privy:test",
  name: "Test",
  username: "test_user",
  walletAddress: linkedWallet.address,
};
mock.module("@privy-io/react-auth", () => ({
  PrivyProvider: ({ children }: { children: ReactNode }) => children,
  usePrivy: () => ({
    ready,
    authenticated,
    user: authenticated ? privyUser() : null,
    getAccessToken: async () => tokenAnswer(),
    logout: async () => {
      logoutCalls++;
      events.push("privy-logout");
    },
  }),
  // Deliberately return fresh function references on each render, like an SDK context update.
  useUser: () => ({
    refreshUser: async () => {
      refreshCalls++;
      if (refreshCalls > 5) return new Promise(() => {});
      return privyUser();
    },
  }),
  useCreateWallet: () => ({
    createWallet: async () => {
      walletCalls++;
      hasWallet = true;
      return linkedWallet;
    },
  }),
  useSigners: () => ({ addSigners: async () => {} }),
}));
mock.module("next/navigation", () => navigationModule);
mock.module("@automator/ui/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));
mock.module("./client", () => ({
  AuthRequestError: class extends Error {},
  authRequest: async (contract: { path: string }) => {
    if (contract.path === "/auth/profile") {
      profileCalls++;
      return profileAnswer();
    }
    sessionCalls++;
    return sessionAnswer();
  },
}));

const { AuthProvider, SessionProvider, useAuthSession } = await import("./provider");
let currentSession: ReturnType<typeof useAuthSession>;

const seenUsers = new Set<AuthUser>();
function Probe() {
  const session = useAuthSession();
  useEffect(() => {
    currentSession = session;
    if (session.user) seenUsers.add(session.user);
  });
  return (
    <>
      <span>{session.user?.username ?? "pending"}</span>
      <span>{session.pending ? "busy" : "idle"}</span>
      <span>{session.error ?? ""}</span>
      <button
        onClick={() => {
          void session.refresh().catch(() => {});
        }}
      >
        Refresh
      </button>
      <button
        onClick={() => {
          void session.logout().catch(() => {});
        }}
      >
        Log out
      </button>
    </>
  );
}

async function render(initialUser?: AuthUser) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const rerender = async () =>
    act(async () => {
      root.render(
        <StrictMode>
          <AuthProvider>
            <SessionProvider initialUser={initialUser}>
              <Probe />
            </SessionProvider>
          </AuthProvider>
        </StrictMode>,
      );
    });
  await rerender();
  return {
    container,
    rerender,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const previousAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const originalFetch = globalThis.fetch;
beforeAll(() => {
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = "test-app";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetched.push({ url: String(input), method: init?.method });
    events.push(`fetch ${init?.method ?? "GET"}`);
    if (deleteAnswer) return deleteAnswer();
    return new Response(null, { status: deleteOk ? 204 : 503 });
  }) as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
  if (previousAppId === undefined) delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  else process.env.NEXT_PUBLIC_PRIVY_APP_ID = previousAppId;
  await GlobalRegistrator.unregister();
});
beforeEach(() => {
  secretsStore.getState().setAccount(null);
  refreshCalls = 0;
  walletCalls = 0;
  sessionCalls = 0;
  logoutCalls = 0;
  hasWallet = false;
  ready = true;
  authenticated = true;
  sdkUserId = savedUser.id;
  profileCalls = 0;
  sessionAnswer = async () => ({ user: { ...savedUser, id: sdkUserId }, expiresAt: 2_000_000_000 });
  profileAnswer = async () => ({ user: { ...savedUser, id: sdkUserId } });
  tokenAnswer = async () => "test-token";
  navigation.reset();
  navigation.pathname = "/flows";
  deleteOk = true;
  deleteAnswer = undefined;
  events.length = 0;
  fetched.length = 0;
  seenUsers.clear();
});

test("SDK callback changes do not restart synchronization; explicit refresh reuses the wallet", async () => {
  const view = await render();
  try {
    expect(view.container.textContent).toContain("test_user");
    expect(refreshCalls).toBe(0);
    expect(walletCalls).toBe(1);
    expect(sessionCalls).toBe(1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(sessionCalls).toBe(1);
    await act(async () => {
      view.container.querySelector("button")!.click();
    });
    expect(sessionCalls).toBe(2);
    expect(walletCalls).toBe(1);
  } finally {
    await view.unmount();
  }
});

test("a server-verified user renders immediately and an unchanged sync keeps it", async () => {
  hasWallet = true;
  const view = await render({ ...savedUser });
  try {
    expect(view.container.textContent).toContain("test_user");
    expect(view.container.textContent).toContain("idle");
    expect(sessionCalls).toBe(1);
    // The synchronized user is equal, so the seeded object is never replaced.
    expect(seenUsers.size).toBe(1);
  } finally {
    await view.unmount();
  }
});

test("a changed profile from the background sync replaces the seeded user", async () => {
  hasWallet = true;
  const view = await render({ ...savedUser, username: "old_name" });
  try {
    expect(view.container.textContent).toContain("test_user");
    expect(seenUsers.size).toBe(2);
  } finally {
    await view.unmount();
  }
});

test("a signed-out visitor on a workspace path is sent to sign in and the cookie is cleared", async () => {
  authenticated = false;
  const view = await render();
  try {
    expect(replaced).toEqual(["/login"]);
    expect(fetched).toEqual([{ url: "/api/auth/session", method: "DELETE" }]);
    expect(view.container.textContent).toContain("pending");
    expect(view.container.textContent).toContain("idle");
    expect(sessionCalls).toBe(0);
  } finally {
    await view.unmount();
  }
});

test("a signed-out visitor on the login page is left alone", async () => {
  authenticated = false;
  navigation.pathname = "/login";
  const view = await render();
  try {
    expect(replaced).toEqual([]);
    expect(fetched).toEqual([]);
  } finally {
    await view.unmount();
  }
});

test("logout clears the session cookie before ending the Privy session", async () => {
  const assign = window.location.assign;
  window.location.assign = () => {
    events.push("assign");
  };
  const view = await render();
  try {
    await act(async () => {
      view.container.querySelectorAll("button")[1]!.click();
    });
    expect(events.filter((event) => event !== "fetch GET")).toEqual([
      "fetch DELETE",
      "privy-logout",
      "assign",
    ]);
  } finally {
    window.location.assign = assign;
    await view.unmount();
  }
});

test("a failed cookie delete keeps the Privy session and surfaces the error", async () => {
  deleteOk = false;
  const view = await render();
  try {
    await act(async () => {
      view.container.querySelectorAll("button")[1]!.click();
    });
    expect(logoutCalls).toBe(0);
    expect(view.container.textContent).toContain("We couldn’t finish logging you out");
    expect(view.container.textContent).toContain("idle");
  } finally {
    await view.unmount();
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

test("switching accounts queues a new synchronization after the previous cookie writer", async () => {
  hasWallet = true;
  const previous = deferred<SessionResponse>();
  sessionAnswer = () => previous.promise;
  const view = await render(savedUser);
  try {
    sdkUserId = "did:privy:next";
    const next = { ...savedUser, id: sdkUserId, username: "next_user" };
    sessionAnswer = async () => ({ user: next, expiresAt: 2_000_000_000 });
    await view.rerender();
    expect(view.container.textContent).not.toContain("test_user");
    expect(sessionCalls).toBe(1);
    await act(async () => {
      previous.resolve({ user: savedUser, expiresAt: 2_000_000_000 });
    });
    expect(sessionCalls).toBe(2);
    expect(currentSession.user).toEqual(next);
    expect(currentSession.pending).toBe(false);
    expect(currentSession.error).toBeNull();
  } finally {
    await view.unmount();
  }
});

test("a manual refresh from the previous account cannot settle into the next session", async () => {
  hasWallet = true;
  const view = await render();
  try {
    const previous = deferred<SessionResponse>();
    sessionAnswer = () => previous.promise;
    let refreshing!: Promise<unknown>;
    await act(async () => {
      refreshing = currentSession.refresh().catch((cause: unknown) => cause);
    });
    sdkUserId = "did:privy:next";
    const next = { ...savedUser, id: sdkUserId, username: "next_user" };
    sessionAnswer = async () => ({ user: next, expiresAt: 2_000_000_000 });
    await view.rerender();
    await act(async () => {
      previous.resolve({ user: savedUser, expiresAt: 2_000_000_000 });
      expect(await refreshing).toBeInstanceOf(Error);
    });
    expect(currentSession.user).toEqual(next);
    expect(currentSession.error).toBeNull();
    expect(currentSession.pending).toBe(false);
  } finally {
    await view.unmount();
  }
});

test("a late profile response cannot replace the next account's synchronized user", async () => {
  hasWallet = true;
  const view = await render();
  try {
    const previous = deferred<{ user: AuthUser }>();
    profileAnswer = () => previous.promise;
    let saving!: Promise<unknown>;
    await act(async () => {
      saving = currentSession
        .saveProfile({ name: "Updated", username: "updated_user" })
        .catch((cause: unknown) => cause);
    });
    expect(profileCalls).toBe(1);
    sdkUserId = "did:privy:next";
    await view.rerender();
    const next = currentSession.user;
    await act(async () => {
      previous.resolve({ user: { ...savedUser, name: "Updated", username: "updated_user" } });
      expect(await saving).toBeInstanceOf(Error);
    });
    expect(currentSession.user).toEqual(next);
    expect(currentSession.user?.id).toBe(sdkUserId);
    expect(currentSession.pending).toBe(false);
  } finally {
    await view.unmount();
  }
});

test("an account change while obtaining a profile token prevents submitting to the wrong account", async () => {
  hasWallet = true;
  const view = await render();
  try {
    const token = deferred<string | null>();
    tokenAnswer = () => token.promise;
    const saving = currentSession
      .saveProfile({ name: "Updated", username: "updated_user" })
      .catch((cause: unknown) => cause);
    tokenAnswer = async () => "next-token";
    sdkUserId = "did:privy:next";
    await view.rerender();
    await act(async () => {
      token.resolve("next-token");
      expect(await saving).toBeInstanceOf(Error);
    });
    expect(profileCalls).toBe(0);
    expect(currentSession.user?.id).toBe(sdkUserId);
  } finally {
    await view.unmount();
  }
});

test("an external sign-out drains the pending cookie write before clearing it and navigating", async () => {
  hasWallet = true;
  const previous = deferred<SessionResponse>();
  sessionAnswer = () => previous.promise;
  const view = await render(savedUser);
  try {
    authenticated = false;
    await view.rerender();
    expect(fetched).toEqual([]);
    expect(replaced).toEqual([]);
    await act(async () => {
      previous.resolve({ user: savedUser, expiresAt: 2_000_000_000 });
    });
    expect(fetched).toEqual([{ url: "/api/auth/session", method: "DELETE" }]);
    expect(replaced).toEqual(["/login"]);
    expect(currentSession.user).toBeNull();
  } finally {
    await view.unmount();
  }
});

test("reauthentication waits for a pending sign-out deletion before writing its new cookie", async () => {
  hasWallet = true;
  const view = await render();
  try {
    const deletion = deferred<Response>();
    deleteAnswer = () => deletion.promise;
    authenticated = false;
    await view.rerender();
    expect(fetched).toEqual([{ url: "/api/auth/session", method: "DELETE" }]);
    authenticated = true;
    sdkUserId = "did:privy:next";
    await view.rerender();
    expect(sessionCalls).toBe(1);
    await act(async () => {
      deletion.resolve(new Response(null, { status: 204 }));
    });
    expect(sessionCalls).toBe(2);
    expect(currentSession.user?.id).toBe(sdkUserId);
    expect(replaced).toEqual([]);
  } finally {
    await view.unmount();
  }
});

test("account changes clear shared secret metadata before the new session finishes loading", async () => {
  hasWallet = true;
  const view = await render();
  try {
    secretsStore.setState({
      status: "ready",
      secrets: [{ name: "old_account_key", createdAt: "2026-09-08", updatedAt: "2026-09-08" }],
    });
    const oldLoad = secretsStore.getState().load;
    const next = deferred<SessionResponse>();
    sessionAnswer = () => next.promise;
    sdkUserId = "did:privy:next";
    await view.rerender();
    expect(secretsStore.getState()).toMatchObject({
      accountId: sdkUserId,
      status: "idle",
      secrets: [],
    });
    expect(secretsStore.getState().load).not.toBe(oldLoad);
    authenticated = false;
    await view.rerender();
    expect(secretsStore.getState().accountId).toBeNull();
    await act(async () => {
      next.resolve({ user: { ...savedUser, id: sdkUserId }, expiresAt: 2_000_000_000 });
    });
  } finally {
    await view.unmount();
  }
});
