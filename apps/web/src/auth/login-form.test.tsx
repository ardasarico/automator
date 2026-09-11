/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { privyModule } from "./test-privy";

const childFlag = "AUTOMATOR_LOGIN_TEST_CHILD";

if (process.env[childFlag] !== import.meta.path) {
  /* Privy and navigation mocks are process-wide in Bun, so the form runs in its own process. */
  test("login form", async () => {
    const child = Bun.spawn([process.execPath, "test", import.meta.path], {
      env: { ...process.env, [childFlag]: import.meta.path },
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

  let ready = true;
  mock.module("@privy-io/react-auth", () =>
    privyModule({
      usePrivy: () => ({ ready, authenticated: false, user: null }),
      useLoginWithEmail: () => ({ sendCode: async () => {}, loginWithCode: async () => {} }),
      useLoginWithOAuth: () => ({ initOAuth: async () => {}, loading: false }),
      useModalStatus: () => ({ isOpen: false }),
      useConnectWallet: () => ({ connectWallet: async () => {} }),
      useLoginWithSiwe: () => ({
        generateSiweMessage: async () => "",
        loginWithSiwe: async () => {},
      }),
    }),
  );
  const { navigationModule } = await import("./test-navigation");
  mock.module("next/navigation", () => ({
    ...navigationModule,
    useSearchParams: () => new URLSearchParams(),
  }));
  /* The Privy mark is decorative; next/image needs a loader the test has no use for. */
  mock.module("next/image", () => ({ default: () => null }));
  mock.module("./provider", () => ({
    useAuthSession: () => ({
      user: null,
      error: null,
      refresh: async () => null,
      logout: async () => {},
    }),
  }));

  const { LoginForm } = await import("./login-form");

  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    ready = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  afterAll(async () => GlobalRegistrator.unregister());

  const render = () => act(async () => root.render(<LoginForm />));

  test("opens with the cursor in the email field, the page's only content", async () => {
    await render();
    expect(document.activeElement?.id).toBe("login-email");
  });

  test("the email field is focused even while the SDK is still loading", async () => {
    ready = false;
    await render();
    expect(document.activeElement?.id).toBe("login-email");
  });
}
