/// <reference types="bun" />
import type { AuthUser } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { act, StrictMode, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let refreshCalls = 0;
let walletCalls = 0;
let sessionCalls = 0;
let logoutCalls = 0;
let hasWallet = false;
let ready = true;
let authenticated = true;
const events: string[] = [];
const { navigation, navigationModule } = await import("./test-navigation");
const replaced = navigation.replaced;
const fetched: Array<{ url: string; method?: string }> = [];
let deleteOk = true;

const linkedWallet = {
  type: "wallet",
  chainType: "ethereum",
  walletClientType: "privy",
  address: "0x1234567890123456789012345678901234567890",
};
const privyUser = () => ({ id: "did:privy:test", linkedAccounts: hasWallet ? [linkedWallet] : [] });
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
    getAccessToken: async () => "test-token",
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
}));
mock.module("next/navigation", () => navigationModule);
mock.module("@automator/ui/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));
mock.module("./client", () => ({
  AuthRequestError: class extends Error {},
  authRequest: async () => {
    sessionCalls++;
    return { user: { ...savedUser }, expiresAt: 2_000_000_000 };
  },
}));

const { AuthProvider, SessionProvider, useAuthSession } = await import("./provider");

const seenUsers = new Set<AuthUser>();
function Probe() {
  const session = useAuthSession();
  useEffect(() => {
    if (session.user) seenUsers.add(session.user);
  });
  return (
    <>
      <span>{session.user?.username ?? "pending"}</span>
      <span>{session.pending ? "busy" : "idle"}</span>
      <span>{session.error ?? ""}</span>
      <button
        onClick={() => {
          void session.refresh();
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
  await act(async () => {
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
  return {
    container,
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
  refreshCalls = 0;
  walletCalls = 0;
  sessionCalls = 0;
  logoutCalls = 0;
  hasWallet = false;
  ready = true;
  authenticated = true;
  navigation.reset();
  navigation.pathname = "/flows";
  deleteOk = true;
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
