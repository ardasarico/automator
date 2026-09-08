/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

if (process.env.AUTOMATOR_WALLET_TEST_CHILD !== import.meta.path) {
  test("wallet signing state regressions", async () => {
    // Other suites mock this component. Exercise the real component in a fresh module graph.
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

  const originalSignerId = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;
  process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID = "test-signer";
  let identity = { id: "user-a", address: "0xaaaa", delegated: false };
  let grantedAddress: string | undefined;
  const getAccessToken = async () => "token";
  mock.module("./wallet-client", () => ({
    fetchWallet: async () => ({
      address: identity.address,
      signing: grantedAddress === identity.address,
    }),
  }));
  const requests: Array<{ address: string; resolve(): void; reject(error: Error): void }> = [];
  mock.module("@privy-io/react-auth", () => ({
    usePrivy: () => ({
      getAccessToken,
      user: {
        id: identity.id,
        linkedAccounts: [
          {
            type: "wallet",
            chainType: "ethereum",
            walletClientType: "privy",
            address: identity.address,
            delegated: identity.delegated,
          },
        ],
      },
    }),
    useSigners: () => ({
      addSigners: ({ address }: { address: string }) =>
        new Promise<void>((resolve, reject) =>
          requests.push({
            address,
            resolve: () => {
              grantedAddress = address;
              resolve();
            },
            reject,
          }),
        ),
    }),
  }));

  const { EnableSigningButton } = await import("./enable-signing-button");
  let root: Root;
  let container: HTMLDivElement;
  const render = () => act(async () => root.render(<EnableSigningButton />));

  beforeEach(() => {
    identity = { id: "user-a", address: "0xaaaa", delegated: false };
    requests.length = 0;
    grantedAddress = undefined;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  afterAll(async () => {
    if (originalSignerId === undefined) delete process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;
    else process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID = originalSignerId;
    await GlobalRegistrator.unregister();
  });

  test("completed signing permission does not carry into another account", async () => {
    await render();
    await act(async () => container.querySelector("button")!.click());
    await act(async () => requests[0]!.resolve());
    expect(container.textContent).toContain("Server signing is enabled");

    identity = { id: "user-b", address: "0xbbbb", delegated: false };
    await render();
    expect(container.textContent).toContain("Enable server signing");
    expect(container.textContent).not.toContain("Server signing is enabled");
  });

  test("a permission request for the previous wallet cannot mark the replacement wallet as enabled", async () => {
    await render();
    await act(async () => container.querySelector("button")!.click());
    identity = { ...identity, address: "0xbbbb" };
    await render();
    expect(container.querySelector("button")!.disabled).toBe(false);
    await act(async () => requests[0]!.resolve());
    expect(container.textContent).not.toContain("Server signing is enabled");

    await act(async () => container.querySelector("button")!.click());
    expect(requests.map((request) => request.address)).toEqual(["0xaaaa", "0xbbbb"]);
  });

  test("revoking a confirmed delegation restores the enable action", async () => {
    await render();
    await act(async () => container.querySelector("button")!.click());
    await act(async () => requests[0]!.resolve());
    identity = { ...identity, delegated: true };
    await render();
    identity = { ...identity, delegated: false };
    grantedAddress = undefined;
    await render();
    expect(container.textContent).toContain("Enable server signing");
  });

  test("delegation to another signer does not hide the enable action", async () => {
    identity = { ...identity, delegated: true };
    await render();
    expect(container.textContent).toContain("Enable server signing");
    expect(container.textContent).not.toContain("Server signing is enabled");
  });

  test("removing only the configured signer is refreshed on focus", async () => {
    identity = { ...identity, delegated: true };
    grantedAddress = identity.address;
    await render();
    expect(container.textContent).toContain("Server signing is enabled");
    grantedAddress = undefined;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(container.textContent).toContain("Enable server signing");
  });

  test("a rejected permission request can be retried", async () => {
    await render();
    await act(async () => container.querySelector("button")!.click());
    await act(async () => requests[0]!.reject(new Error("Denied")));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Try again");
    await act(async () => container.querySelector("button")!.click());
    expect(requests).toHaveLength(2);
    await act(async () => requests[1]!.resolve());
    expect(container.textContent).toContain("Server signing is enabled");
  });
}
