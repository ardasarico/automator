/// <reference types="bun" />
import type { AuthUser } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { privyModule } from "./test-privy";

const childFlag = "AUTOMATOR_ONBOARDING_TEST_CHILD";
const e2eToken = "automator-e2e-token";

if (process.env[childFlag] !== import.meta.path) {
  /*
   * Privy and navigation mocks are process-wide in Bun, so the form runs in its own process.
   * Twice: `NEXT_PUBLIC_E2E_TOKEN` is read once at module load, and the form must behave
   * like production without it and like the Playwright suite's browser with it.
   */
  for (const [label, token] of [
    ["production", ""],
    ["e2e session", e2eToken],
  ] as const) {
    test(`onboarding form (${label})`, async () => {
      const child = Bun.spawn([process.execPath, "test", import.meta.path], {
        env: { ...process.env, [childFlag]: import.meta.path, NEXT_PUBLIC_E2E_TOKEN: token },
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
  }
} else {
  GlobalRegistrator.register();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const e2e = Boolean(process.env.NEXT_PUBLIC_E2E_TOKEN);

  let ready = true;
  let authenticated = true;
  const sdkUser = {
    id: "did:privy:test",
    linkedAccounts: [
      {
        type: "wallet",
        chainType: "ethereum",
        walletClientType: "privy",
        address: "0x1234567890123456789012345678901234567890",
      },
    ],
  };
  mock.module("@privy-io/react-auth", () =>
    privyModule({
      usePrivy: () => ({
        ready,
        authenticated,
        user: authenticated ? sdkUser : null,
        getAccessToken: async () => (authenticated ? "sdk-token" : null),
        logout: async () => {},
      }),
      useUser: () => ({ refreshUser: async () => sdkUser }),
      useCreateWallet: () => ({ createWallet: async () => sdkUser.linkedAccounts[0] }),
    }),
  );
  const { navigation, navigationModule } = await import("./test-navigation");
  mock.module("next/navigation", () => ({
    ...navigationModule,
    useSearchParams: () => new URLSearchParams(),
  }));
  mock.module("@automator/ui/theme-provider", () => ({
    useTheme: () => ({ resolvedTheme: "light" }),
  }));

  const fresh: AuthUser = {
    id: "did:privy:test",
    name: null,
    username: null,
    walletAddress: sdkUser.linkedAccounts[0]!.address,
  };
  const onboarded: AuthUser = { ...fresh, name: "Ada Lovelace", username: "ada_l" };

  /* The profile requests the form makes; the provider's own session sync is answered apart. */
  const requests: Array<{ url: string; method?: string; auth?: string; body: unknown }> = [];
  let sessionUser: AuthUser = fresh;
  let answer: () => Response = () => Response.json({ user: onboarded });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url) === "/api/auth/session")
      return Response.json({ user: sessionUser, expiresAt: 4_102_444_800 });
    const headers = new Headers(init?.headers);
    requests.push({
      url: String(url),
      method: init?.method,
      auth: headers.get("Authorization") ?? undefined,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return answer();
  }) as typeof fetch;

  const { SessionProvider } = await import("./provider");
  const { OnboardingForm } = await import("./onboarding-form");

  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    ready = true;
    authenticated = !e2e;
    navigation.reset();
    navigation.pathname = "/onboarding";
    requests.length = 0;
    sessionUser = fresh;
    answer = () => Response.json({ user: onboarded });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await GlobalRegistrator.unregister();
  });

  async function render(initialUser?: AuthUser) {
    if (initialUser) sessionUser = initialUser;
    await act(async () => {
      root.render(
        <SessionProvider initialUser={initialUser}>
          <OnboardingForm />
        </SessionProvider>,
      );
    });
  }
  function input(id: string) {
    return container.querySelector<HTMLInputElement>(`#${id}`)!;
  }
  /* happy-dom's input events do not reach React's root listener; call the prop directly. */
  async function type(id: string, value: string) {
    const field = input(id);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    const key = Object.keys(field).find((name) => name.startsWith("__reactProps"))!;
    const props = (field as unknown as Record<string, { onChange(event: unknown): void }>)[key]!;
    await act(async () => props.onChange({ target: field, currentTarget: field }));
  }
  async function submit() {
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    // The save is a fetch round trip; let it settle before reading the result.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  const alerts = () =>
    Array.from(container.querySelectorAll("[role=alert]"), (node) => node.textContent);

  if (!e2e) {
    test("sends a signed-out visitor to the login page", async () => {
      authenticated = false;
      await render();
      expect(navigation.replaced).toEqual(["/login"]);
    });

    test("waits for the SDK before anyone can submit", async () => {
      ready = false;
      await render(fresh);
      expect(navigation.replaced).toEqual([]);
      const button = container.querySelector<HTMLButtonElement>("button[type=submit]")!;
      expect(button.disabled).toBe(true);
      ready = true;
      await render(fresh);
      expect(button.disabled).toBe(false);
    });
  } else {
    test("sends a visitor without a session cookie to the login page", async () => {
      await render();
      expect(navigation.replaced).toEqual(["/login"]);
    });

    test("keeps the e2e session's form although the SDK has no session", async () => {
      await render(fresh);
      expect(navigation.replaced).toEqual([]);
      expect(input("profile-name")).not.toBeNull();
      await type("profile-name", "Ada Lovelace");
      await type("profile-username", "ada_l");
      await submit();
      expect(requests.map((request) => request.auth)).toEqual([`Bearer ${e2eToken}`]);
      expect(navigation.replaced).toContain("/flows");
    });
  }

  test("sends an onboarded user on to the workspace", async () => {
    await render(onboarded);
    expect(navigation.replaced).toEqual(["/flows"]);
  });

  test("shows the form at once for the user the cookie names", async () => {
    await render(fresh);
    expect(container.querySelector("form")).not.toBeNull();
    expect(container.textContent).toContain("This mark is already yours");
  });

  test("refuses a name made only of spaces without a request", async () => {
    await render(fresh);
    await type("profile-name", "   ");
    await type("profile-username", "ada_l");
    await submit();
    expect(requests).toEqual([]);
    expect(input("profile-name").validationMessage).toBe("Enter a name");
    await type("profile-name", "Ada");
    expect(input("profile-name").validationMessage).toBe("");
  });

  test("names the username format when the pattern is not met", async () => {
    await render(fresh);
    await type("profile-username", "1abc");
    const field = input("profile-username");
    expect(field.validity.patternMismatch).toBe(true);
    await act(async () => {
      field.dispatchEvent(new Event("invalid", { bubbles: false, cancelable: true }));
    });
    expect(field.validationMessage).toBe(
      "Start with a letter and use only letters, numbers or underscores.",
    );
    await type("profile-username", "abc");
    expect(field.validationMessage).toBe("");
  });

  test("lowercases the username as it is typed", async () => {
    await render(fresh);
    await type("profile-username", "Ada_L");
    expect(input("profile-username").value).toBe("ada_l");
  });

  test("saves the trimmed profile and moves on", async () => {
    await render(fresh);
    await type("profile-name", "  Ada Lovelace ");
    await type("profile-username", "ada_l");
    await submit();
    expect(requests).toEqual([
      {
        url: "/api/auth/profile",
        method: "PUT",
        auth: e2e ? `Bearer ${e2eToken}` : "Bearer sdk-token",
        body: { name: "Ada Lovelace", username: "ada_l" },
      },
    ]);
    // The saved user is onboarded, so the effect that sends such users on fires as well.
    expect(navigation.replaced).toContain("/flows");
    expect(navigation.replaced).not.toContain("/login");
    expect(alerts()).toEqual([]);
  });

  test("reports a taken username against the field and clears it on edit", async () => {
    answer = () => Response.json({ error: "username_taken" }, { status: 409 });
    await render(fresh);
    await type("profile-name", "Ada Lovelace");
    await type("profile-username", "taken_name");
    await submit();
    expect(alerts()).toEqual(["That username isn’t available. Choose another one."]);
    expect(input("profile-username").getAttribute("aria-invalid")).toBe("true");
    expect(input("profile-username").getAttribute("aria-describedby")).toBe(
      "profile-error username-hint",
    );
    expect(navigation.replaced).toEqual([]);
    await type("profile-username", "taken_name2");
    expect(input("profile-username").getAttribute("aria-invalid")).toBe("false");
  });

  test("keeps a generic failure off the username field", async () => {
    answer = () => Response.json({ error: "unavailable" }, { status: 503 });
    await render(fresh);
    await type("profile-name", "Ada Lovelace");
    await type("profile-username", "ada_l");
    await submit();
    expect(alerts()).toEqual(["We couldn’t save your profile. Please try again."]);
    expect(input("profile-username").getAttribute("aria-invalid")).toBe("false");
    expect(navigation.replaced).toEqual([]);
  });
}
