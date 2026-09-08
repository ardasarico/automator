/// <reference types="bun" />
import type { Wallet } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

if (process.env.AUTOMATOR_WALLET_TEST_CHILD !== import.meta.path) {
  test("wallet balance state regressions", async () => {
    // Privy and component mocks are process-wide in Bun; keep them out of the other suites.
    const child = Bun.spawn([process.execPath, "test", import.meta.path], {
      env: { ...process.env, AUTOMATOR_WALLET_TEST_CHILD: import.meta.path },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ exitCode, output: exitCode === 0 ? "" : stdout + stderr }).toEqual({
      exitCode: 0,
      output: "",
    });
  });
} else {
  GlobalRegistrator.register();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  let identity = { id: "user-a", address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
  let tokenProvider = async (): Promise<string | null> => "token";
  const getAccessToken = () => tokenProvider();
  mock.module("@privy-io/react-auth", () => ({
    usePrivy: () => ({
      user: {
        id: identity.id,
        linkedAccounts: [
          {
            type: "wallet",
            chainType: "ethereum",
            walletClientType: "privy",
            address: identity.address,
          },
        ],
      },
    }),
  }));
  mock.module("../auth/access-token", () => ({ useAccessToken: () => getAccessToken }));

  const requests: Array<{
    chainId: number;
    signal: AbortSignal;
    resolve(wallet: Wallet): void;
  }> = [];
  mock.module("./wallet-client", () => ({
    WalletRequestError: class extends Error {},
    fetchWallet: (_token: string, chainId: number, signal: AbortSignal) =>
      new Promise<Wallet>((resolve) => requests.push({ chainId, signal, resolve })),
  }));

  const { WalletFunds } = await import("./wallet-funds");
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    identity = { id: "user-a", address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
    tokenProvider = async () => "token";
    requests.length = 0;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  afterAll(async () => GlobalRegistrator.unregister());

  const render = (chainId: number) =>
    act(async () => root.render(<WalletFunds chainId={chainId} />));
  const wallet = (chainId: number, nativeBalance = "12"): Wallet => ({
    chainId,
    chainName: chainId === 1 ? "Ethereum" : "Base",
    address: identity.address,
    nativeBalance,
    nativeSymbol: "ETH",
  });

  test("switching accounts clears balances cached for the previous account", async () => {
    await render(1);
    await act(async () => requests[0]!.resolve(wallet(1)));
    expect(container.textContent).toContain("12 ETH");

    identity = { id: "user-b", address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    await render(1);
    expect(container.textContent).not.toContain("12 ETH");
    expect(requests).toHaveLength(2);
    await act(async () => requests[1]!.resolve(wallet(1, "7")));
    expect(container.textContent).toContain("7 ETH");
    expect(container.textContent).toContain("0xbbbb");
  });

  test("replacing the embedded wallet clears the same account's cached balances", async () => {
    await render(1);
    await act(async () => requests[0]!.resolve(wallet(1)));
    identity = { ...identity, address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    await render(1);
    expect(container.textContent).not.toContain("12 ETH");
    expect(requests).toHaveLength(2);
  });

  test("an aborted chain request cannot populate the cache after a later chain loaded", async () => {
    await render(8453);
    await render(1);
    expect(requests[0]!.signal.aborted).toBe(true);
    await act(async () => requests[1]!.resolve(wallet(1)));
    await act(async () => requests[0]!.resolve(wallet(8453, "99")));

    await render(8453);
    expect(container.textContent).not.toContain("99 ETH");
    expect(requests).toHaveLength(3);
    await act(async () => requests[2]!.resolve(wallet(8453, "8")));
    expect(container.textContent).toContain("8 ETH");
  });

  test("switching chains while retrieving the access token skips the obsolete balance request", async () => {
    let resolveToken!: (token: string) => void;
    tokenProvider = () => new Promise((resolve) => (resolveToken = resolve));
    await render(1);
    const resolveOldToken = resolveToken;
    tokenProvider = async () => "token";
    await render(8453);
    expect(requests.map((request) => request.chainId)).toEqual([8453]);
    await act(async () => resolveOldToken("old-token"));
    expect(requests.map((request) => request.chainId)).toEqual([8453]);
  });

  test("returning to a cached chain preserves its balance while discarding the pending request", async () => {
    await render(1);
    await act(async () => requests[0]!.resolve(wallet(1)));
    await render(8453);
    await render(1);
    expect(container.textContent).toContain("12 ETH");
    expect(requests).toHaveLength(2);
    expect(requests[1]!.signal.aborted).toBe(true);
  });
}
