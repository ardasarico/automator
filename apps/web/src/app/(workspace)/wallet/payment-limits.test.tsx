/// <reference types="bun" />
import type { PaymentPolicy, PaymentPolicyState } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

if (process.env.AUTOMATOR_POLICY_TEST_CHILD !== import.meta.path) {
  test("payment policy async state regressions", async () => {
    const child = Bun.spawn([process.execPath, "test", import.meta.path], {
      env: { ...process.env, AUTOMATOR_POLICY_TEST_CHILD: import.meta.path },
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
  let identity = "user-a";
  const getAccessToken = async () => "token";
  mock.module("../../../auth/access-token", () => ({ useAccessToken: () => getAccessToken }));
  mock.module("../../../auth/provider", () => ({
    useAuthSession: () => ({ user: { id: identity, walletAddress: "0x123" } }),
  }));
  const requests: Array<{
    signal: AbortSignal;
    policy?: PaymentPolicy;
    resolve(value: PaymentPolicyState): void;
    reject(error: Error): void;
  }> = [];
  mock.module("../../../wallet/payment-policy-client", () => ({
    requestPaymentPolicy: (_token: string, signal: AbortSignal, policy?: PaymentPolicy) =>
      new Promise<PaymentPolicyState>((resolve, reject) =>
        requests.push({ signal, policy, resolve, reject }),
      ),
  }));
  const { PaymentLimits } = await import("./payment-limits");
  let root: Root;
  let container: HTMLDivElement;
  const fixture = (enabled = false): PaymentPolicyState => ({
    policy: {
      enabled,
      recipients: [],
      limits: [{ chainId: 84532, asset: "native", perTransfer: "1", perDay: "2" }],
    },
    day: "2026-09-08",
    usage: [],
  });
  const render = () => act(async () => root.render(<PaymentLimits />));
  const button = (name: string) =>
    [...container.querySelectorAll("button")].find((item) => item.textContent === name)!;
  beforeEach(() => {
    identity = "user-a";
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

  test("account changes cancel and discard the previous account response", async () => {
    await render();
    identity = "user-b";
    await render();
    expect(requests[0]!.signal.aborted).toBe(true);
    await act(async () => requests[0]!.resolve(fixture(true)));
    expect(container.textContent).toContain("Loading payment limits");
    await act(async () => requests[1]!.resolve(fixture(false)));
    expect(container.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
  });

  test("failed reads expose retry without an editable default policy", async () => {
    await render();
    await act(async () => requests[0]!.reject(new Error("offline")));
    expect(container.querySelector("form")).toBeNull();
    await act(async () => button("Retry").click());
    expect(requests).toHaveLength(2);
    await act(async () => requests[1]!.resolve(fixture()));
    expect(container.querySelector("form")).not.toBeNull();
  });

  test("editing during save preserves newer changes and stays unsaved", async () => {
    await render();
    await act(async () => requests[0]!.resolve(fixture()));
    await act(async () =>
      (container.querySelector('[role="switch"]') as HTMLButtonElement).click(),
    );
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(requests[1]!.policy?.enabled).toBe(true);
    await act(async () =>
      (container.querySelector('[role="switch"]') as HTMLButtonElement).click(),
    );
    await act(async () => requests[1]!.resolve(fixture(true)));
    expect(container.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain("Your latest edits are still unsaved");
    expect(button("Save limits").disabled).toBe(false);
  });
}
