/// <reference types="bun" />
import { parseScreenConfig } from "@automator/contracts";
import type { IdentityActions } from "@automator/miniapp";
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { privyModule } from "../../../test-privy";

let authenticated = false;
let isGuest = false;
let token: string | null = "visitor-token";
let tokenError = false;
let tokenReads = 0;
const loginCalls: unknown[] = [];
let callbacks: { onComplete(): void; onError(code: string): void };
let actions: IdentityActions;
let wallets: {
  address: string;
  walletClientType: string;
  switchChain: (chainId: number) => Promise<void>;
  getEthereumProvider: () => Promise<{
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  }>;
}[] = [];
const switched: number[] = [];
const sent: unknown[] = [];
let sendFails: unknown = null;

function wallet(address: string, walletClientType = "privy") {
  return {
    address,
    walletClientType,
    switchChain: async (chainId: number) => {
      switched.push(chainId);
    },
    getEthereumProvider: async () => ({
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method !== "eth_sendTransaction") throw new Error(`Unexpected ${method}`);
        if (sendFails) throw sendFails;
        sent.push(params?.[0]);
        return `0x${"a".repeat(64)}`;
      },
    }),
  };
}

mock.module("@privy-io/react-auth", () =>
  privyModule({
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
    useWallets: () => ({ wallets }),
  }),
);
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
  wallets = [];
  switched.length = 0;
  sent.length = 0;
  sendFails = null;
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

const payment = {
  chainId: 84532,
  chainName: "Base Sepolia",
  token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  decimals: 6,
  to: "0x9999999999999999999999999999999999999999",
  amount: "12.50",
  amountUnits: "12500000",
};
const payer = "0x1111111111111111111111111111111111111111";

function renderPayment() {
  renderToStaticMarkup(<IdentityHost>{null}</IdentityHost>);
  return actions.usdcPayment!;
}

test("a signed-in visitor pays from their wallet on the payment's own chain", async () => {
  authenticated = true;
  wallets = [wallet(payer)];
  const answer = await renderPayment().pay(payment);
  expect(answer).toEqual({ txHash: `0x${"a".repeat(64)}`, privyToken: "visitor-token" });
  expect(switched).toEqual([84532]);
  expect(sent).toEqual([
    {
      from: payer,
      to: payment.token,
      data: expect.stringContaining("0xa9059cbb"),
    },
  ]);
});

test("a signed-out visitor signs in first, then pays", async () => {
  wallets = [wallet(payer)];
  const answer = renderPayment().pay(payment);
  expect(loginCalls).toEqual([{}]);
  authenticated = true;
  callbacks.onComplete();
  await expect(answer).resolves.toMatchObject({ txHash: `0x${"a".repeat(64)}` });
  expect(sent).toHaveLength(1);
});

test("a visitor who cancels in their wallet is told so, and nothing is sent", async () => {
  authenticated = true;
  wallets = [wallet(payer)];
  sendFails = { code: 4001, message: "User rejected the request" };
  await expect(renderPayment().pay(payment)).rejects.toThrow("cancelled");
  expect(sent).toHaveLength(0);
});

test("a signed-out visitor's wallet is not read, so opening the screen prompts nothing", async () => {
  wallets = [wallet(payer)];
  expect(await renderPayment().wallet(payment)).toBeNull();
  expect(loginCalls).toHaveLength(0);
});

test("a signed-in visitor with no wallet at all cannot pay", async () => {
  authenticated = true;
  wallets = [];
  expect(await renderPayment().wallet(payment)).toBeNull();
  await expect(renderPayment().pay(payment)).rejects.toThrow("wallet");
});
