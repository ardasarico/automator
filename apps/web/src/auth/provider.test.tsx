/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { act, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let refreshCalls = 0;
let walletCalls = 0;
let sessionCalls = 0;
let hasWallet = false;
const linkedWallet = {
  type: "wallet",
  chainType: "ethereum",
  walletClientType: "privy",
  address: "0x1234567890123456789012345678901234567890",
};
const privyUser = () => ({ id: "did:privy:test", linkedAccounts: hasWallet ? [linkedWallet] : [] });
const savedUser = {
  id: "did:privy:test",
  name: "Test",
  username: "test_user",
  walletAddress: linkedWallet.address,
};
mock.module("@privy-io/react-auth", () => ({
  PrivyProvider: ({ children }: { children: ReactNode }) => children,
  usePrivy: () => ({
    ready: true,
    authenticated: true,
    user: privyUser(),
    getAccessToken: async () => "test-token",
    logout: async () => {},
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
mock.module("@automator/ui/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));
mock.module("./client", () => ({
  AuthRequestError: class extends Error {},
  authRequest: async () => {
    sessionCalls++;
    return { user: savedUser, expiresAt: 2_000_000_000 };
  },
}));
const { AuthProvider, useAuthSession } = await import("./provider");
function Probe() {
  const session = useAuthSession();
  return (
    <>
      <span>{session.user?.username ?? "pending"}</span>
      <button
        onClick={() => {
          void session.refresh();
        }}
      >
        Refresh
      </button>
    </>
  );
}
const previousAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
beforeAll(() => {
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = "test-app";
});
afterAll(async () => {
  if (previousAppId === undefined) delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  else process.env.NEXT_PUBLIC_PRIVY_APP_ID = previousAppId;
  await GlobalRegistrator.unregister();
});

test("SDK callback changes do not restart synchronization; explicit refresh reuses the wallet", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <StrictMode>
          <AuthProvider>
            <Probe />
          </AuthProvider>
        </StrictMode>,
      );
    });
    expect(container.textContent).toContain("test_user");
    expect(refreshCalls).toBe(0);
    expect(walletCalls).toBe(1);
    expect(sessionCalls).toBe(1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(sessionCalls).toBe(1);
    await act(async () => {
      container.querySelector("button")!.click();
    });
    expect(sessionCalls).toBe(2);
    expect(walletCalls).toBe(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
