/// <reference types="bun" />
import type { AccountUsage } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act, createRef } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const auth = await import("../auth/provider");
const accessToken = await import("../auth/access-token");
const signing = await import("../builder/enable-signing-button");
const { secretsStore } = await import("../builder/secrets-store");
const { SettingsDialog } = await import("./settings-dialog");

const usage: AccountUsage = {
  flows: 4,
  activeFlows: 2,
  runsLast30Days: { manual: 1, webhook: 2, schedule: 3, miniapp: 4, event: 5, watch: 6 },
  secrets: 1,
  listings: 0,
  since: "2026-08-09T00:00:00.000Z",
};
const originalFetch = globalThis.fetch;
const finalFocus = createRef<HTMLButtonElement>();
let container: HTMLDivElement;
let root: Root;
let token: () => Promise<string | null>;
let respond: (url: string) => Response;
let calls: string[];
let restore: Array<() => void>;

beforeEach(() => {
  secretsStore.getState().setAccount(null);
  secretsStore.getState().setAccount("did:privy:test");
  token = async () => "token";
  respond = (url) => Response.json(url.endsWith("/usage") ? usage : { secrets: [] });
  calls = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    return respond(String(url));
  }) as unknown as typeof fetch;
  const tokenSpy = spyOn(accessToken, "useAccessToken").mockReturnValue(() => token());
  const authSpy = spyOn(auth, "useAuthSession").mockReturnValue({
    user: { id: "did:privy:test", name: "Test", username: "test_user", walletAddress: null },
    pending: false,
    error: null,
    refresh: async () => {
      throw new Error("Unused");
    },
    saveProfile: async () => {
      throw new Error("Unused");
    },
    logout: async () => {},
  });
  const signingSpy = spyOn(signing, "EnableSigningButton").mockReturnValue(null);
  restore = [
    () => tokenSpy.mockRestore(),
    () => authSpy.mockRestore(),
    () => signingSpy.mockRestore(),
  ];
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  for (const reset of restore) reset();
  globalThis.fetch = originalFetch;
  secretsStore.getState().setAccount(null);
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

async function mount(section: "Connected apps" | "Usage") {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<SettingsDialog open onOpenChange={() => {}} finalFocus={finalFocus} />);
  });
  await click(section);
}

async function click(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) => element.textContent?.trim() === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

describe("Settings connected apps", () => {
  test("reports a token failure and lets the user retry without reopening Settings", async () => {
    token = async () => {
      throw new Error("Token refresh failed");
    };
    await mount("Connected apps");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Connected apps are unavailable",
    );
    expect(document.body.textContent).not.toContain("Checking…");
    expect(document.body.textContent).not.toContain("Not connected");
    expect(calls).toEqual([]);

    token = async () => "token";
    await click("Retry");
    expect(calls).toEqual(["/api/secrets"]);
    expect(document.querySelector('[role="alert"]')?.textContent).toBeUndefined();
    expect(document.body.textContent).toContain("Not connected");
  });

  test("does not report missing credentials when the list request failed", async () => {
    respond = () => Response.json({ error: "unavailable" }, { status: 503 });
    await mount("Connected apps");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Secrets are unavailable",
    );
    expect(document.body.textContent).not.toContain("Not connected");

    respond = () =>
      Response.json({
        secrets: [
          {
            name: "discord_webhook",
            createdAt: "2026-09-08T00:00:00Z",
            updatedAt: "2026-09-08T00:00:00Z",
          },
        ],
      });
    await click("Retry");
    expect(calls).toEqual(["/api/secrets", "/api/secrets"]);
    expect(document.querySelector('[role="alert"]')?.textContent).toBeUndefined();
    expect(document.body.textContent).toContain("{{secrets.discord_webhook}}");
  });

  test("uses credentials already loaded by the Variables panel", async () => {
    secretsStore.setState({ status: "ready", secrets: [], error: null });
    await mount("Connected apps");
    expect(calls).toEqual([]);
    expect(document.body.textContent).toContain("Not connected");
  });

  test("does not start a secrets request after leaving the panel during token refresh", async () => {
    let resolveToken!: (value: string) => void;
    token = () =>
      new Promise((resolve) => {
        resolveToken = resolve;
      });
    await mount("Connected apps");
    expect(document.body.textContent).toContain("Checking…");
    await click("Preferences");
    await act(async () => resolveToken("token"));
    expect(calls).toEqual([]);
  });
});

test("usage can recover in place and includes watch runs in its total", async () => {
  respond = () => Response.json({ error: "unavailable" }, { status: 503 });
  await mount("Usage");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Usage is unavailable");

  respond = () => Response.json(usage);
  await click("Retry");
  expect(calls).toEqual(["/api/account/usage", "/api/account/usage"]);
  expect(document.querySelector('[role="alert"]')?.textContent).toBeUndefined();
  expect(document.body.textContent).toContain("6 watch");
  const runRow = Array.from(document.querySelectorAll("dt")).find(
    (element) => element.textContent === "Runs in the last 30 days",
  )?.parentElement?.parentElement;
  expect(runRow?.lastElementChild?.textContent).toBe("21");
});
