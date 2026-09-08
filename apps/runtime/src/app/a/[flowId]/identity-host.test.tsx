/// <reference types="bun" />
import { parseScreenConfig } from "@automator/contracts";
import type { IdentityActions } from "@automator/miniapp";
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let authenticated = false;
let isGuest = false;
let token: string | null = "visitor-token";
let tokenError = false;
let tokenReads = 0;
const loginCalls: unknown[] = [];
let callbacks: { onComplete(): void; onError(code: string): void };
let actions: IdentityActions;

mock.module("@privy-io/react-auth", () => ({
  PrivyProvider: ({ children }: { children: ReactNode }) => children,
  usePrivy: () => ({
    authenticated,
    user: authenticated ? { isGuest } : null,
    getAccessToken: async () => {
      tokenReads++;
      if (tokenError) throw new Error("SDK token refresh failed");
      return token;
    },
  }),
  useLogin: (next: typeof callbacks) => {
    callbacks = next;
    return { login: (options: unknown) => loginCalls.push(options) };
  },
}));
mock.module("@automator/ui/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
mock.module("@automator/miniapp", () => ({
  IdentityActionsProvider: (props: { actions: IdentityActions; children: ReactNode }) => {
    actions = props.actions;
    return props.children;
  },
}));

const { IdentityHost } = await import("./identity-host");
const config = parseScreenConfig("privy.login", { methods: ["email"] });
const originalAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

beforeAll(() => {
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = "test-app";
});
afterAll(() => {
  if (originalAppId === undefined) delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  else process.env.NEXT_PUBLIC_PRIVY_APP_ID = originalAppId;
});
beforeEach(() => {
  authenticated = false;
  isGuest = false;
  token = "visitor-token";
  tokenError = false;
  tokenReads = 0;
  loginCalls.length = 0;
});

function renderHost() {
  renderToStaticMarkup(<IdentityHost>{null}</IdentityHost>);
  return actions.privyLogin!;
}

test("a returning visitor reuses their token without waiting for a login callback", async () => {
  authenticated = true;
  const login = renderHost();
  await expect(login(config)).resolves.toEqual({ privyToken: "visitor-token" });
  await expect(login(config)).resolves.toEqual({ privyToken: "visitor-token" });
  expect(tokenReads).toBe(2);
  expect(loginCalls).toHaveLength(0);
});

test("a signed-out visitor receives their token after the configured modal completes", async () => {
  const answer = renderHost()(config);
  expect(loginCalls).toEqual([{ loginMethods: ["email"] }]);
  expect(tokenReads).toBe(0);
  callbacks.onComplete();
  await expect(answer).resolves.toEqual({ privyToken: "visitor-token" });
});

test("a guest account still goes through the sign-in modal", async () => {
  authenticated = true;
  isGuest = true;
  const answer = renderHost()(config);
  expect(loginCalls).toEqual([{ loginMethods: ["email"] }]);
  expect(tokenReads).toBe(0);
  callbacks.onComplete();
  await expect(answer).resolves.toEqual({ privyToken: "visitor-token" });
});

test("closing the modal rejects the pending sign-in and permits another attempt", async () => {
  const login = renderHost();
  const answer = login(config);
  callbacks.onError("exited_auth_flow");
  await expect(answer).rejects.toThrow("closed the sign-in");
  const retry = login(config);
  callbacks.onComplete();
  await expect(retry).resolves.toEqual({ privyToken: "visitor-token" });
});

test("a returning visitor with no access token gets a retryable error", async () => {
  authenticated = true;
  token = null;
  await expect(renderHost()(config)).rejects.toThrow("Sign-in did not complete");
  expect(loginCalls).toHaveLength(0);
});

test("token refresh failures are reported after an existing or new sign-in", async () => {
  tokenError = true;
  authenticated = true;
  await expect(renderHost()(config)).rejects.toThrow("Sign-in did not complete");

  authenticated = false;
  const answer = renderHost()(config);
  callbacks.onComplete();
  await expect(answer).rejects.toThrow("Sign-in did not complete");
});
